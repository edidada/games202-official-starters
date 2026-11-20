#include "denoiser.h"
#include <algorithm>
#include <cmath>
#include <stdexcept>

Denoiser::Denoiser() : m_useTemportal(false) {}

void Denoiser::Reprojection(const FrameInfo &frameInfo) {
    const int height = m_accColor.m_height, width = m_accColor.m_width;
    const auto &previous = m_preFrameInfo;
    // The final matrix already includes projection AND the previous camera.
    std::vector<Matrix4x4> currentToPrevious;
    const size_t objects = frameInfo.m_matrix.size() - 2;
    for (size_t id = 0; id < objects; ++id) {
        if (id + 2 < previous.m_matrix.size())
            currentToPrevious.push_back(previous.m_matrix.back() *
                previous.m_matrix[id] * Inverse(frameInfo.m_matrix[id]));
        else currentToPrevious.push_back(Matrix4x4());
    }
#pragma omp parallel for
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            m_valid(x, y) = false;
            m_misc(x, y) = Float3(0.f);
            const float rawId = frameInfo.m_id(x, y);
            if (!std::isfinite(rawId) || rawId < 0 || rawId >= objects ||
                std::floor(rawId) != rawId) continue;
            const size_t id = static_cast<size_t>(rawId);
            if (id + 2 >= previous.m_matrix.size()) continue;
            const auto &a = currentToPrevious[id];
            const auto p = frameInfo.m_position(x, y);
            const float w = a.m[3][0]*p.x + a.m[3][1]*p.y + a.m[3][2]*p.z + a.m[3][3];
            if (!std::isfinite(w) || std::abs(w) < 1e-8f) continue;
            const float sx = (a.m[0][0]*p.x + a.m[0][1]*p.y + a.m[0][2]*p.z + a.m[0][3])/w;
            const float sy = (a.m[1][0]*p.x + a.m[1][1]*p.y + a.m[1][2]*p.z + a.m[1][3])/w;
            if (!std::isfinite(sx) || !std::isfinite(sy) || sx < 0 || sy < 0 ||
                sx >= width || sy >= height) continue;
            // Screen coordinates describe pixel cells [x,x+1), [y,y+1).
            const int px = static_cast<int>(std::floor(sx));
            const int py = static_cast<int>(std::floor(sy));
            if (previous.m_id(px, py) != rawId) continue;
            m_misc(x, y) = m_accColor(px, py);
            m_valid(x, y) = true;
        }
    }
    std::swap(m_misc, m_accColor);
}

void Denoiser::TemporalAccumulation(const Buffer2D<Float3> &current) {
    const int height = m_accColor.m_height, width = m_accColor.m_width;
#pragma omp parallel for
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            Float3 mean(0.f), variance(0.f);
            int count = 0;
            for (int j = std::max(0,y-3); j <= std::min(height-1,y+3); ++j)
                for (int i = std::max(0,x-3); i <= std::min(width-1,x+3); ++i) {
                    mean += current(i,j); ++count;
                }
            mean /= static_cast<float>(count);
            // Second pass avoids cancellation for nearly constant HDR values.
            for (int j = std::max(0,y-3); j <= std::min(height-1,y+3); ++j)
                for (int i = std::max(0,x-3); i <= std::min(width-1,x+3); ++i)
                    variance += Sqr(current(i,j)-mean);
            const Float3 radius = SafeSqrt(variance/static_cast<float>(count))*m_colorBoxK;
            const Float3 history = Clamp(m_accColor(x,y),mean-radius,mean+radius);
            m_misc(x,y) = m_valid(x,y) ? Lerp(history,current(x,y),m_alpha) : current(x,y);
        }
    }
    std::swap(m_misc,m_accColor);
}

Buffer2D<Float3> Denoiser::Filter(const FrameInfo &frameInfo) {
    const int height = frameInfo.m_beauty.m_height, width = frameInfo.m_beauty.m_width;
    auto output = CreateBuffer2D<Float3>(width,height);
#pragma omp parallel for
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            const auto color = frameInfo.m_beauty(x,y);
            if (frameInfo.m_id(x,y) < 0) { output(x,y)=color; continue; }
            Float3 sum(0.f); double weightSum = 0;
            const auto normal = frameInfo.m_normal(x,y);
            for (int j = std::max(0,y-16); j <= std::min(height-1,y+16); ++j) {
                for (int i = std::max(0,x-16); i <= std::min(width-1,x+16); ++i) {
                    if (frameInfo.m_id(i,j) < 0) continue;
                    const auto delta = frameInfo.m_position(i,j)-frameInfo.m_position(x,y);
                    const float lengthSquared = SqrLength(delta);
                    const float plane = lengthSquared > 1e-12f ? Dot(normal,delta)/std::sqrt(lengthSquared) : 0.f;
                    const float angle = std::acos(std::clamp(Dot(normal,frameInfo.m_normal(i,j)),-1.f,1.f));
                    const double exponent = -((Sqr(float(i-x))+Sqr(float(j-y)))/(2*Sqr(m_sigmaCoord)) +
                        SqrDistance(color,frameInfo.m_beauty(i,j))/(2*Sqr(m_sigmaColor)) +
                        Sqr(angle)/(2*Sqr(m_sigmaNormal)) + Sqr(plane)/(2*Sqr(m_sigmaPlane)));
                    const float weight = static_cast<float>(std::exp(exponent));
                    sum += frameInfo.m_beauty(i,j)*weight; weightSum += weight;
                }
            }
            output(x,y) = weightSum > 0 ? sum/static_cast<float>(weightSum) : color;
        }
    }
    return output;
}

void Denoiser::Init(const FrameInfo &, const Buffer2D<Float3> &filteredColor) {
    m_accColor.Copy(filteredColor);
    m_misc = CreateBuffer2D<Float3>(m_accColor.m_width,m_accColor.m_height);
    m_valid = CreateBuffer2D<bool>(m_accColor.m_width,m_accColor.m_height);
}
void Denoiser::Maintain(const FrameInfo &frameInfo) { m_preFrameInfo=frameInfo; }
Buffer2D<Float3> Denoiser::ProcessFrame(const FrameInfo &frameInfo) {
    const int w=frameInfo.m_beauty.m_width,h=frameInfo.m_beauty.m_height;
    auto shape=[&](const auto &b){return b.m_width==w && b.m_height==h;};
    if(w<=0 || h<=0 || !shape(frameInfo.m_normal) || !shape(frameInfo.m_position) ||
       !shape(frameInfo.m_depth) || !shape(frameInfo.m_id) || frameInfo.m_matrix.size()<2 ||
       !(m_alpha>=0 && m_alpha<=1) || !(m_sigmaCoord>0) || !(m_sigmaColor>0) ||
       !(m_sigmaNormal>0) || !(m_sigmaPlane>0) || !(m_colorBoxK>=0))
        throw std::invalid_argument("invalid frame dimensions, matrices or filter parameters");
    const auto filtered=Filter(frameInfo);
    if(m_useTemportal && m_accColor.m_width==w && m_accColor.m_height==h) {
        Reprojection(frameInfo); TemporalAccumulation(filtered);
    } else Init(frameInfo,filtered);
    Maintain(frameInfo); m_useTemportal=true;
    return m_accColor;
}
