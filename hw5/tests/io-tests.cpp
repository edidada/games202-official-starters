#include "denoiser.h"
#include <filesystem>
#include <fstream>
#include <stdexcept>
int main(int argc,char **argv){
 if(argc!=2)return 2;std::filesystem::path dir(argv[1]);std::filesystem::create_directories(dir);
 auto rgb=CreateBuffer2D<Float3>(8,6);auto scalar=CreateBuffer2D<float>(8,6);
 for(int y=0;y<6;++y)for(int x=0;x<8;++x){rgb(x,y)=Float3(.25f,.5f,1.f);scalar(x,y)=2.f;}
 auto path=[&](std::string n){return (dir/n).string();};
 WriteFloat3Image(rgb,path("rgb.exr"));WriteFloatImage(scalar,path("scalar.exr"));
 auto r=ReadFloat3Image(path("rgb.exr"));auto s=ReadFloatImage(path("scalar.exr"));
 for(int y=0;y<6;++y)for(int x=0;x<8;++x)if(AbsSum(rgb(x,y),r(x,y))>1e-6 || s(x,y)!=2.f)throw std::runtime_error("EXR roundtrip");
 for(int frame=0;frame<2;++frame){
  std::string suffix="_"+std::to_string(frame)+".exr";
  WriteFloat3Image(rgb,path("beauty"+suffix));
  for(int y=0;y<6;++y)for(int x=0;x<8;++x)rgb(x,y)=Float3(0,0,1);
  WriteFloat3Image(rgb,path("normal"+suffix));
  for(int y=0;y<6;++y)for(int x=0;x<8;++x)rgb(x,y)=Float3(x+.5f,y+.5f,0);
  WriteFloat3Image(rgb,path("position"+suffix));WriteFloatImage(scalar,path("depth"+suffix));
  for(int y=0;y<6;++y)for(int x=0;x<8;++x){scalar(x,y)=0;rgb(x,y)=Float3(.25f,.5f,1.f);}
  WriteFloatImage(scalar,path("ID"+suffix));
  std::ofstream out(path("matrix_"+std::to_string(frame)+".mat"),std::ios::binary);int count=1;Matrix4x4 m;
  out.write(reinterpret_cast<char*>(&count),sizeof(count));for(int i=0;i<3;++i)out.write(reinterpret_cast<char*>(&m),sizeof(m));
 }
 std::cout<<"PASS EXR scalar/RGB roundtrip and two-frame CLI input generated\n";
}
