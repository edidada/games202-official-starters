#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
struct Image {int w=0,h=0,c=0;unsigned char *p=nullptr;explicit Image(const std::string &name){p=stbi_load(name.c_str(),&w,&h,&c,3);if(!p||w!=h||w<2)throw std::runtime_error("invalid LUT image "+name);}~Image(){stbi_image_free(p);}Image(const Image&)=delete;int at(int x,int y,int c=0)const{return p[(y*w+x)*3+c];}};
void check(bool ok,const char *message){if(!ok)throw std::runtime_error(message);}
int main(){try{for(const std::string stem:{"GGX_E_MC_LUT","GGX_E_LUT"}){
 Image e(stem+".png");std::ifstream file(stem+".csv");check(bool(file),"missing energy CSV");std::string line;std::getline(file,line);int rows=0,clipped=0;double maxPartition=0;
 while(std::getline(file,line)){
  std::replace(line.begin(),line.end(),',',' ');std::istringstream in(line);double r,mu,value,a,b;check(bool(in>>r>>mu>>value>>a>>b),"invalid CSV row");check(std::isfinite(value)&&value>=0,"invalid raw energy");
  maxPartition=std::max(maxPartition,std::abs(value-a-b));clipped+=value>1;
  int x=int(mu*e.w),y=int((1-r)*e.h),byte=int(std::lround(std::clamp(value,0.0,1.0)*255));
  for(int c=0;c<3;c++)check(e.at(x,y,c)==byte,"LUT coordinate/orientation/quantization mismatch");rows++;
 }
 check(rows==e.w*e.h&&maxPartition<1e-10,"energy table completeness or split partition");
 const std::string avg=stem=="GGX_E_LUT"?"GGX_Eavg_LUT":"GGX_Eavg_MC_LUT";Image average(avg+".png");std::ifstream csv(avg+".csv");std::getline(csv,line);int avgRows=0;
 for(int y=0;y<e.h;y++){
  check(bool(std::getline(csv,line)),"missing average row");std::replace(line.begin(),line.end(),',',' ');std::istringstream in(line);double rough,value;check(bool(in>>rough>>value),"invalid average CSV");double expected=0;
  for(int x=0;x<e.w;x++)expected+=2.0*((x+.5)/e.w)*(e.at(x,y)/255.0)/e.w;
  check(std::abs(value-expected)<1e-12&&std::abs(rough-(e.h-y-.5)/e.h)<1e-12,"Eavg weighted quadrature/orientation");
  for(int x=0;x<e.w;x++)for(int c=0;c<3;c++)check(average.at(x,y,c)==int(std::lround(expected*255)),"Eavg row not constant or wrong quantization");avgRows++;
 }
 std::cout<<"LUT_CHECK "<<stem<<" energy_rows="<<rows<<" average_rows="<<avgRows<<" raw_clipped_for_display="<<clipped<<" max_split_partition_error="<<maxPartition<<std::endl;
 }std::cout<<"PASS LUT orientation/quantization, average weighted integral and constant rows"<<std::endl;return 0;}catch(const std::exception &e){std::cerr<<e.what()<<std::endl;return 1;}}
