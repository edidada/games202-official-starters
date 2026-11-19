#include <nori/integrator.h>
#include <nori/scene.h>
#include <nori/ray.h>
#include <filesystem/resolver.h>
#include <sh/spherical_harmonics.h>
#include <sh/default_image.h>
#include <Eigen/Core>
#include <fstream>
#include <random>
#include <algorithm>
#include <iomanip>
#include <stb_image.h>

NORI_NAMESPACE_BEGIN

namespace ProjEnv
{
    std::vector<std::unique_ptr<float[]>>
    LoadCubemapImages(const std::string &cubemapDir, int &width, int &height,
                      int &channel)
    {
        std::vector<std::string> cubemapNames{"negx.jpg", "posx.jpg", "posy.jpg",
                                              "negy.jpg", "posz.jpg", "negz.jpg"};
        std::vector<std::unique_ptr<float[]>> images(6);
        for (int i = 0; i < 6; i++)
        {
            std::string filename = cubemapDir + "/" + cubemapNames[i];
            int w, h, c;
            float *image = stbi_loadf(filename.c_str(), &w, &h, &c, 3);
            if (!image)
            {
                std::cout << "Failed to load image: " << filename << std::endl;
                exit(-1);
            }
            if (i == 0)
            {
                width = w;
                height = h;
                channel = 3;
            }
            else if (w != width || h != height || c <= 0)
            {
                std::cout << "Dismatch resolution for 6 images in cubemap" << std::endl;
                exit(-1);
            }
            // stb allocates with malloc; unique_ptr<float[]> must own a new[] copy.
            images[i] = std::unique_ptr<float[]>(new float[size_t(w) * h * 3]);
            std::copy(image, image + size_t(w) * h * 3, images[i].get());
            stbi_image_free(image);
            int index = (0 * 128 + 0) * channel;
            // std::cout << images[i][index + 0] << "\t" << images[i][index + 1] << "\t"
            //           << images[i][index + 2] << std::endl;
        }
        return images;
    }

    // Same face order as cubemapNames: -X,+X,+Y,-Y,+Z,-Z.
    const Eigen::Vector3f cubemapFaceDirections[6][3] = {
        {{0,0,1}, {0,-1,0}, {-1,0,0}},
        {{0,0,-1}, {0,-1,0}, {1,0,0}},
        {{1,0,0}, {0,0,1}, {0,1,0}},
        {{1,0,0}, {0,0,-1}, {0,-1,0}},
        {{1,0,0}, {0,-1,0}, {0,0,1}},
        {{-1,0,0}, {0,-1,0}, {0,0,-1}}
    };

    float CalcPreArea(const float &x, const float &y)
    {
        return std::atan2(x * y, std::sqrt(x * x + y * y + 1.0));
    }

    float CalcArea(const float &u_, const float &v_, const int &width,
                   const int &height)
    {
        // transform from [0..res - 1] to [- (1 - 1 / res) .. (1 - 1 / res)]
        // ( 0.5 is for texel center addressing)
        float u = (2.0 * (u_ + 0.5) / width) - 1.0;
        float v = (2.0 * (v_ + 0.5) / height) - 1.0;

        // shift from a demi texel, mean 1.0 / size  with u and v in [-1..1]
        float invResolutionW = 1.0 / width;
        float invResolutionH = 1.0 / height;

        // u and v are the -1..1 texture coordinate on the current face.
        // get projected area for this texel
        float x0 = u - invResolutionW;
        float y0 = v - invResolutionH;
        float x1 = u + invResolutionW;
        float y1 = v + invResolutionH;
        float angle = CalcPreArea(x0, y0) - CalcPreArea(x0, y1) -
                      CalcPreArea(x1, y0) + CalcPreArea(x1, y1);

        return angle;
    }

    // template <typename T> T ProjectSH() {}

    template <size_t SHOrder>
    std::vector<Eigen::Array3f> PrecomputeCubemapSH(const std::vector<std::unique_ptr<float[]>> &images,
                                                    const int &width, const int &height,
                                                    const int &channel)
    {
        std::vector<Eigen::Vector3f> cubemapDirs;
        cubemapDirs.reserve(6 * width * height);
        for (int i = 0; i < 6; i++)
        {
            Eigen::Vector3f faceDirX = cubemapFaceDirections[i][0];
            Eigen::Vector3f faceDirY = cubemapFaceDirections[i][1];
            Eigen::Vector3f faceDirZ = cubemapFaceDirections[i][2];
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    float u = 2 * ((x + 0.5) / width) - 1;
                    float v = 2 * ((y + 0.5) / height) - 1;
                    Eigen::Vector3f dir = (faceDirX * u + faceDirY * v + faceDirZ).normalized();
                    cubemapDirs.push_back(dir);
                }
            }
        }
        constexpr int SHNum = (SHOrder + 1) * (SHOrder + 1);
        std::vector<Eigen::Array3f> SHCoeffiecents(SHNum);
        for (int i = 0; i < SHNum; i++)
            SHCoeffiecents[i] = Eigen::Array3f(0);
        std::vector<Eigen::Array3d> sums(SHNum, Eigen::Array3d::Zero());
        for (int i = 0; i < 6; i++)
        {
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    // TODO: here you need to compute light sh of each face of cubemap of each pixel
                    // TODO: 此处你需要计算每个像素下cubemap某个面的球谐系数
                    Eigen::Vector3f dir = cubemapDirs[i * width * height + y * width + x];
                    int index = (y * width + x) * channel;
                    Eigen::Array3f Le(images[i][index + 0], images[i][index + 1],
                                      images[i][index + 2]);
                    const double weight = CalcArea(x, y, width, height);
                    const Eigen::Vector3d direction = dir.cast<double>();
                    for (int l = 0; l <= int(SHOrder); ++l)
                        for (int m = -l; m <= l; ++m)
                            sums[l * (l + 1) + m] += Le.cast<double>() *
                                (weight * sh::EvalSH(l, m, direction));
                }
            }
        }
        for (int i = 0; i < SHNum; ++i) SHCoeffiecents[i] = sums[i].cast<float>();
        return SHCoeffiecents;
    }
}

// Analytic tests independent of scene mesh and Monte Carlo transport.
void runPRTSelfTests() {
    constexpr int resolution = 32;
    constexpr double pi = 3.14159265358979323846;
    std::vector<std::unique_ptr<float[]>> images(6);
    double area = 0;
    for (int y=0; y<resolution; ++y)
        for (int x=0; x<resolution; ++x)
            area += 6.0 * ProjEnv::CalcArea(x,y,resolution,resolution);
    if (std::abs(area-4*pi)>1e-4) throw NoriException("Cubemap area oracle failed");
    double maxError=0;
    for (int test=0; test<2; ++test) {
        for (int face=0; face<6; ++face) {
            images[face].reset(new float[resolution*resolution*3]);
            for (int y=0; y<resolution; ++y) for (int x=0; x<resolution; ++x) {
                const double u=2.0*(x+.5)/resolution-1, v=2.0*(y+.5)/resolution-1;
                // Explicit OpenGL face directions; do not reuse projector table.
                Eigen::Vector3d d;
                switch(face) {
                    case 0: d=Eigen::Vector3d(-1,-v,u);break;
                    case 1: d=Eigen::Vector3d(1,-v,-u);break;
                    case 2: d=Eigen::Vector3d(u,1,v);break;
                    case 3: d=Eigen::Vector3d(u,-1,-v);break;
                    case 4: d=Eigen::Vector3d(u,-v,1);break;
                    default:d=Eigen::Vector3d(-u,-v,-1);break;
                }
                d.normalize();
                const double value=test ? 1+.2*d.x()+.3*d.y()+.4*d.z() : 1;
                for(int c=0;c<3;c++) images[face][(y*resolution+x)*3+c]=float(value);
            }
        }
        const auto coeff=ProjEnv::PrecomputeCubemapSH<2>(images,resolution,resolution,3);
        const double linear=std::sqrt(4*pi/3);
        const double expected[9]={std::sqrt(4*pi),test?-.3*linear:0,
            test?.4*linear:0,test?-.2*linear:0,0,0,0,0,0};
        for(int i=0;i<9;i++)for(int c=0;c<3;c++){
            const double error=std::abs(coeff[i][c]-expected[i]);
            maxError=std::max(maxError,error);
            if(error>1e-4) throw NoriException("Environment SH analytic oracle failed at coefficient %d",i);
        }
    }
    std::cout << "PRT_ENV_ORACLE PASS area=" << std::setprecision(12) << area
              << " max_error=" << maxError << " cases=2 coefficients=54" << std::endl;
}

class PRTIntegrator : public Integrator
{
public:
    static constexpr int SHOrder = 2;
    static constexpr int SHCoeffLength = (SHOrder + 1) * (SHOrder + 1);

    enum class Type
    {
        Unshadowed = 0,
        Shadowed = 1,
        Interreflection = 2
    };

    PRTIntegrator(const PropertyList &props)
    {
        /* No parameters this time */
        m_SampleCount = props.getInteger("PRTSampleCount", 100);
        m_CubemapPath = props.getString("cubemap");
        auto type = props.getString("type", "unshadowed");
        if (type == "unshadowed")
        {
            m_Type = Type::Unshadowed;
        }
        else if (type == "shadowed")
        {
            m_Type = Type::Shadowed;
        }
        else if (type == "interreflection")
        {
            m_Type = Type::Interreflection;
            m_Bounce = props.getInteger("bounce", 1);
        }
        else
        {
            throw NoriException("Unsupported type: %s.", type);
        }
    }

    virtual void preprocess(const Scene *scene) override
    {

        if (scene->getMeshes().size() != 1)
            throw NoriException("PRT coefficient indexing requires exactly one mesh");
        if (m_SampleCount <= 0) throw NoriException("PRTSampleCount must be positive");
        // Here only compute one mesh
        const auto mesh = scene->getMeshes()[0];
        // Projection environment
        auto cubePath = getFileResolver()->resolve(m_CubemapPath);
        auto lightPath = cubePath / "light.txt";
        auto transPath = cubePath / "transport.txt";
        std::ofstream lightFout(lightPath.str());
        std::ofstream fout(transPath.str());
        if (!lightFout || !fout) throw NoriException("Cannot open PRT output files");
        lightFout << std::setprecision(9);
        fout << std::setprecision(9);
        int width, height, channel;
        std::vector<std::unique_ptr<float[]>> images =
            ProjEnv::LoadCubemapImages(cubePath.str(), width, height, channel);
        auto envCoeffs = ProjEnv::PrecomputeCubemapSH<SHOrder>(images, width, height, channel);
        m_LightCoeffs.resize(3, SHCoeffLength);
        for (int i = 0; i < envCoeffs.size(); i++)
        {
            lightFout << (envCoeffs)[i].x() << " " << (envCoeffs)[i].y() << " " << (envCoeffs)[i].z() << std::endl;
            m_LightCoeffs.col(i) = (envCoeffs)[i];
        }
        std::cout << "Computed light sh coeffs from: " << cubePath.str() << " to: " << lightPath.str() << std::endl;
        // Projection transport
        m_TransportSHCoeffs.resize(SHCoeffLength, mesh->getVertexCount());
        fout << mesh->getVertexCount() << std::endl;
        // Common deterministic equal-area spherical samples for both transport
        // modes and every environment. Visibility only removes contributions.
        std::vector<Eigen::Vector3d> directions(m_SampleCount);
        std::vector<Eigen::Matrix<double, SHCoeffLength, 1>> basis(m_SampleCount);
        const double pi = 3.14159265358979323846;
        const double goldenAngle = pi * (3.0 - std::sqrt(5.0));
        for (int sample=0; sample<m_SampleCount; ++sample) {
            const double z=1.0-2.0*(sample+.5)/m_SampleCount;
            const double radius=std::sqrt(std::max(0.0,1-z*z));
            const double phi=sample*goldenAngle;
            directions[sample]=Eigen::Vector3d(radius*std::cos(phi),radius*std::sin(phi),z);
            for(int l=0;l<=SHOrder;++l)for(int m=-l;m<=l;++m)
                basis[sample][l*(l+1)+m]=sh::EvalSH(l,m,directions[sample]);
        }
        for (int i = 0; i < mesh->getVertexCount(); i++)
        {
            const Point3f &v = mesh->getVertexPositions().col(i);
            const Normal3f &n = mesh->getVertexNormals().col(i);
            Eigen::Matrix<double, SHCoeffLength, 1> shCoeff;
            shCoeff.setZero();
            const Normal3f normal=n.normalized();
            for(int sample=0;sample<m_SampleCount;++sample) {
                const auto &d=directions[sample];
                const Vector3f wi(float(d.x()),float(d.y()),float(d.z()));
                const double cosine=std::max(0.0f,normal.dot(wi));
                if(cosine<=0)continue;
                if(m_Type!=Type::Unshadowed && scene->rayIntersect(Ray3f(v+normal*Epsilon,wi)))continue;
                shCoeff += basis[sample] * cosine;
            }
            shCoeff *= 4*pi/m_SampleCount;
            for (int j = 0; j < shCoeff.size(); j++)
            {
                m_TransportSHCoeffs.col(i).coeffRef(j) = shCoeff[j];
            }
        }
        if (m_Type == Type::Interreflection)
        {
            // TODO: leave for bonus
        }

        // Save in face format
        for (int f = 0; f < mesh->getTriangleCount(); f++)
        {
            const MatrixXu &F = mesh->getIndices();
            uint32_t idx0 = F(0, f), idx1 = F(1, f), idx2 = F(2, f);
            for (int j = 0; j < SHCoeffLength; j++)
            {
                fout << m_TransportSHCoeffs.col(idx0).coeff(j) << " ";
            }
            fout << std::endl;
            for (int j = 0; j < SHCoeffLength; j++)
            {
                fout << m_TransportSHCoeffs.col(idx1).coeff(j) << " ";
            }
            fout << std::endl;
            for (int j = 0; j < SHCoeffLength; j++)
            {
                fout << m_TransportSHCoeffs.col(idx2).coeff(j) << " ";
            }
            fout << std::endl;
        }
        std::cout << "Computed SH coeffs"
                  << " to: " << transPath.str() << std::endl;
    }

    Color3f Li(const Scene *scene, Sampler *sampler, const Ray3f &ray) const
    {
        Intersection its;
        if (!scene->rayIntersect(ray, its))
            return Color3f(0.0f);

        const Eigen::Matrix<Vector3f::Scalar, SHCoeffLength, 1> sh0 = m_TransportSHCoeffs.col(its.tri_index.x()),
                                                                sh1 = m_TransportSHCoeffs.col(its.tri_index.y()),
                                                                sh2 = m_TransportSHCoeffs.col(its.tri_index.z());
        const Eigen::Matrix<Vector3f::Scalar, SHCoeffLength, 1> rL = m_LightCoeffs.row(0), gL = m_LightCoeffs.row(1), bL = m_LightCoeffs.row(2);

        Color3f c0 = Color3f(rL.dot(sh0), gL.dot(sh0), bL.dot(sh0)),
                c1 = Color3f(rL.dot(sh1), gL.dot(sh1), bL.dot(sh1)),
                c2 = Color3f(rL.dot(sh2), gL.dot(sh2), bL.dot(sh2));

        const Vector3f &bary = its.bary;
        Color3f c = bary.x() * c0 + bary.y() * c1 + bary.z() * c2;
        // TODO: you need to delete the following four line codes after finishing your calculation to SH,
        //       we use it to visualize the normals of model for debug.
        // TODO: 在完成了球谐系数计算后，你需要删除下列四行，这四行代码的作用是用来可视化模型法线

        return c * INV_PI;
    }

    std::string toString() const
    {
        return "PRTIntegrator[]";
    }

private:
    Type m_Type;
    int m_Bounce = 1;
    int m_SampleCount = 100;
    std::string m_CubemapPath;
    Eigen::MatrixXf m_TransportSHCoeffs;
    Eigen::MatrixXf m_LightCoeffs;
};

NORI_REGISTER_CLASS(PRTIntegrator, "prt");
NORI_NAMESPACE_END