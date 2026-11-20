#include <filesystem>
#include <stdexcept>
#include <fstream>
#include <string>

#include "denoiser.h"
#include "util/image.h"
#include "util/mathutil.h"

std::vector<Matrix4x4> ReadMatrix(const std::string &filename) {
    std::ifstream is;
    is.open(filename, std::ios::binary);
    CHECK(is.is_open());
    int shapeNum = 0;
    is.read(reinterpret_cast<char *>(&shapeNum), sizeof(int));
    if (!is || shapeNum < 0 || shapeNum > 100000)
        throw std::runtime_error("invalid matrix count: " + filename);
    std::vector<Matrix4x4> matrix(shapeNum + 2);
    for (int i = 0; i < shapeNum + 2; i++) {
        is.read(reinterpret_cast<char *>(&matrix[i]), sizeof(Matrix4x4));
    }
    if (!is) throw std::runtime_error("truncated matrix file: " + filename);
    is.close();
    return matrix;
}

FrameInfo LoadFrameInfo(const filesystem::path &inputDir, const int &idx) {
    Buffer2D<Float3> beauty =
        ReadFloat3Image((inputDir / ("beauty_" + std::to_string(idx) + ".exr")).str());
    Buffer2D<Float3> normal =
        ReadFloat3Image((inputDir / ("normal_" + std::to_string(idx) + ".exr")).str());
    Buffer2D<Float3> position =
        ReadFloat3Image((inputDir / ("position_" + std::to_string(idx) + ".exr")).str());
    Buffer2D<float> depth =
        ReadFloatImage((inputDir / ("depth_" + std::to_string(idx) + ".exr")).str());
    Buffer2D<float> id =
        ReadFloatImage((inputDir / ("ID_" + std::to_string(idx) + ".exr")).str());
    std::vector<Matrix4x4> matrix =
        ReadMatrix((inputDir / ("matrix_" + std::to_string(idx) + ".mat")).str());

    FrameInfo frameInfo = {beauty, depth, normal, position, id, matrix};
    return frameInfo;
}

void Denoise(const filesystem::path &inputDir, const filesystem::path &outputDir,
             const int &frameNum) {
    Denoiser denoiser;
    for (int i = 0; i < frameNum; i++) {
        std::cout << "Frame: " << i << std::endl;
        FrameInfo frameInfo = LoadFrameInfo(inputDir, i);
        Buffer2D<Float3> image = denoiser.ProcessFrame(frameInfo);
        std::string filename =
            (outputDir / ("result_" + std::to_string(i) + ".exr")).str();
        WriteFloat3Image(image, filename);
    }
}

int main(int argc, char **argv) {
    try {
        if (argc != 4) {
            std::cerr << "Usage: Denoise INPUT_DIRECTORY OUTPUT_DIRECTORY FRAME_COUNT\n";
            return 2;
        }
        size_t end = 0;
        int count = std::stoi(argv[3], &end);
        if (argv[3][end] != '\0' || count <= 0)
            throw std::invalid_argument("frame count must be a positive integer");
        std::filesystem::create_directories(argv[2]);
        Denoise(filesystem::path(argv[1]), filesystem::path(argv[2]), count);
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n'; return 1;
    }
    return 0;
}
