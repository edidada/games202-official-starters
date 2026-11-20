#include "denoiser.h"
#include <fstream>
#include <stdexcept>
#include <filesystem>
#include <random>
#include <chrono>
#include <algorithm>
void require(bool b,const char *s){if(!b)throw std::runtime_error(s);}
void near(Float3 a,Float3 b,float eps=2e-5f){require(AbsSum(a,b)<eps,"numeric mismatch");}
FrameInfo frame(int w,int h){
 FrameInfo f;f.m_beauty=CreateBuffer2D<Float3>(w,h);f.m_position=CreateBuffer2D<Float3>(w,h);
 f.m_normal=CreateBuffer2D<Float3>(w,h);f.m_id=CreateBuffer2D<float>(w,h);f.m_depth=CreateBuffer2D<float>(w,h);
 f.m_matrix.resize(3);
 for(int y=0;y<h;++y)for(int x=0;x<w;++x){f.m_beauty(x,y)=Float3(0.5f);f.m_position(x,y)=Float3(x+0.5f,y+0.5f,0);f.m_normal(x,y)=Float3(0,0,1);f.m_id(x,y)=0;f.m_depth(x,y)=1;}
 return f;
}
void filterTests(){
 Denoiser d;auto f=frame(9,7);auto out=d.Filter(f);
 for(int y=0;y<7;++y)for(int x=0;x<9;++x)near(out(x,y),Float3(.5f));
 // Independent long-double reference of the prescribed four-factor kernel.
 f.m_beauty(4,3)=Float3(.9f,.3f,.1f);f.m_normal(1,1)=Float3(0,1,0);f.m_position(6,3).z=2;
 out=d.Filter(f);long double total=0,sx=0,sy=0,sz=0;
 for(int y=0;y<7;++y)for(int x=0;x<9;++x){
  auto c=f.m_beauty(x,y),a=f.m_beauty(4,3),p=f.m_position(x,y)-f.m_position(4,3);
  long double dc=(c.x-a.x)*(c.x-a.x)+(c.y-a.y)*(c.y-a.y)+(c.z-a.z)*(c.z-a.z);
  long double len=sqrtl(p.x*p.x+p.y*p.y+p.z*p.z),dp=len>0?p.z/len:0;
  long double angle=acosl(f.m_normal(x,y).z);
  long double e=-((x-4)*(x-4)+(y-3)*(y-3))/(2.L*32*32)-dc/(2.L*.6*.6)-angle*angle/(2.L*.1*.1)-dp*dp/(2.L*.1*.1);
  long double w=expl(e);total+=w;sx+=w*c.x;sy+=w*c.y;sz+=w*c.z;
 }
 near(out(4,3),Float3(sx/total,sy/total,sz/total));
 // Opposite normals must remain distinct; angle clamp must include -1.
 auto edge=frame(2,1);edge.m_normal(1,0)=Float3(0,0,-1);edge.m_beauty(1,0)=Float3(1);
 near(d.Filter(edge)(0,0),Float3(.5f));
 edge.m_normal(1,0)=Float3(0,0,1);edge.m_position(1,0)=Float3(.5f,.5f,1);
 near(d.Filter(edge)(0,0),Float3(.5f));
 std::cout<<"PASS filter constant, independent kernel, opposite normals, parallel planes\n";
}
void projectionTests(){
 auto old=frame(8,4),cur=frame(8,4);Denoiser d;
 for(int y=0;y<4;++y)for(int x=0;x<8;++x)old.m_beauty(x,y)=Float3(float(x+10*y));
 d.Init(old,old.m_beauty);d.Maintain(old);
 // Current object translated +2; previous camera translates +1 in screen x.
 cur.m_matrix[0].m[0][3]=2;d.m_preFrameInfo.m_matrix.back().m[0][3]=1;
 // Deliberately nonidentity camera matrix: must NOT be applied twice.
 d.m_preFrameInfo.m_matrix[1].m[0][3]=500;
 cur.m_position(3,1)=Float3(3.5f,1.5f,0); // previous x = 2.5
 cur.m_position(0,0)=Float3(-.01f,.5f,0);
 cur.m_id(7,3)=-1;d.m_preFrameInfo.m_id(5,2)=1;
 d.Reprojection(cur);require(d.m_valid(3,1),"moving object projection");near(d.m_accColor(3,1),Float3(12));
 require(!d.m_valid(0,0),"negative out of bounds");require(!d.m_valid(7,3),"background");require(!d.m_valid(6,2),"id mismatch");
 auto invalid=cur;invalid.m_position.Copy(cur.m_position);invalid.m_position(4,0)=Float3(1000,0,0);
 d.Init(old,old.m_beauty);d.Maintain(old);d.Reprojection(invalid);require(!d.m_valid(4,0),"positive out of bounds");
 // Hand-derived affine case: current 90-degree rotation + scale2 + (3,-1)
 // maps local(1.5,2.5) to world(-2,2). Previous object +(1,1),
 // previous screen diag(2,1,1,2), gives screen(2.5,1.75) -> pixel(2,1).
 auto affine=frame(8,4);affine.m_matrix[0].m[0][0]=0;affine.m_matrix[0].m[0][1]=-2;
 affine.m_matrix[0].m[1][0]=2;affine.m_matrix[0].m[1][1]=0;
 affine.m_matrix[0].m[0][3]=3;affine.m_matrix[0].m[1][3]=-1;affine.m_position(3,1)=Float3(-2,2,0);
 d.Init(old,old.m_beauty);d.Maintain(old);d.m_preFrameInfo.m_matrix[0].m[0][3]=1;d.m_preFrameInfo.m_matrix[0].m[1][3]=1;
 d.m_preFrameInfo.m_matrix.back().m[0][0]=2;d.m_preFrameInfo.m_matrix.back().m[3][3]=2;
 d.Reprojection(affine);require(d.m_valid(3,1),"rotation/scale/perspective projection");near(d.m_accColor(3,1),Float3(12));
 d.Init(old,old.m_beauty);d.Maintain(old);d.m_preFrameInfo.m_matrix.back().m[3][3]=0;
 d.Reprojection(affine);require(!d.m_valid(3,1),"zero homogeneous denominator");
 std::cout<<"PASS object/camera/rotation/scale/homogeneous reprojection, bounds, background, object ID\n";
}
void temporalTests(){
 auto f=frame(7,7);Denoiser d;d.Init(f,f.m_beauty);
 auto c=CreateBuffer2D<Float3>(7,7);for(int y=0;y<7;++y)for(int x=0;x<7;++x){c(x,y)=Float3(float(x)/6);d.m_valid(x,y)=true;d.m_accColor(x,y)=Float3(100);}
 d.m_valid(0,0)=false;d.TemporalAccumulation(c);
 // Seven equally spaced samples: mean .5, population variance 1/9.
 near(d.m_accColor(3,3),Float3(.2f*.5f+.8f*(.5f+1.f/3)));
 near(d.m_accColor(0,0),c(0,0));
 auto small=frame(1,1);d.ProcessFrame(small);near(d.m_accColor(0,0),Float3(.5f));
 require(d.m_accColor.m_width==1,"resize reset");
 bool rejected=false;small.m_matrix.clear();try{d.ProcessFrame(small);}catch(const std::invalid_argument&){rejected=true;}require(rejected,"malformed frame");
 std::cout<<"PASS 7x7 population variance clamp, EMA, invalid fallback, resize, malformed frame\n";
}
void ppm(const std::string &name,const Buffer2D<Float3> &b){
 std::ofstream out(name,std::ios::binary);out<<"P6\n"<<b.m_width<<" "<<b.m_height<<"\n255\n";
 for(int y=0;y<b.m_height;++y)for(int x=0;x<b.m_width;++x){auto c=b(x,y);for(float v:{c.x,c.y,c.z})out.put(static_cast<char>(std::lround(std::clamp(v,0.f,1.f)*255)));}
}
void sequence(const std::string &dir, bool atrous=false){
 std::filesystem::create_directories(dir);std::mt19937 rng(20261120);std::uniform_real_distribution<float> noise(-.3f,.3f);
 Denoiser d;d.m_useAtrous=atrous;double raw=0,spatial=0,temporal=0;int count=0;
 for(int t=0;t<12;++t){auto f=frame(64,40);auto truth=frame(64,40).m_beauty;
  for(int y=0;y<40;++y)for(int x=0;x<64;++x){float v=x<32?.3f:.75f;truth(x,y)=Float3(v);f.m_beauty(x,y)=Float3(v+noise(rng));f.m_normal(x,y)=x<32?Float3(0,0,1):Float3(0,1,0);}
  auto filtered=atrous?d.FilterAtrous(f):d.Filter(f);auto result=d.ProcessFrame(f);
  for(int y=0;y<40;++y)for(int x=0;x<64;++x){raw+=SqrDistance(f.m_beauty(x,y),truth(x,y));spatial+=SqrDistance(filtered(x,y),truth(x,y));temporal+=SqrDistance(result(x,y),truth(x,y));++count;}
  std::string n=std::to_string(100+t).substr(1);ppm(dir+"/raw-"+n+".ppm",f.m_beauty);ppm(dir+"/filter-"+n+".ppm",filtered);ppm(dir+"/result-"+n+".ppm",result);
 }
 require(spatial<raw*.2,"spatial noise reduction");require(temporal<spatial,"temporal noise reduction");
 std::ofstream out(dir+"/metrics.json");out<<"{\"fixture\":\"synthetic two-normal edge, not official scenes\",\"frames\":12,\"raw_mse\":"<<raw/(3*count)<<",\"filter_mse\":"<<spatial/(3*count)<<",\"temporal_mse\":"<<temporal/(3*count)<<"}\n";
 std::cout<<"PASS synthetic sequence noise reduction "<<raw/(3*count)<<" "<<spatial/(3*count)<<" "<<temporal/(3*count)<<"\n";
}

void movingSequence(const std::string &dir, bool atrous=false){
 std::filesystem::create_directories(dir);std::mt19937 rng(20261121);std::uniform_real_distribution<float> noise(-.3f,.3f);
 Denoiser d;d.m_useAtrous=atrous;double raw=0,spatial=0,temporal=0;int count=0,rejected=0;
 for(int t=0;t<12;++t){auto f=frame(64,40);f.m_matrix.resize(4);f.m_matrix[1].m[0][3]=float(t);
  auto truth=CreateBuffer2D<Float3>(64,40);
  for(int y=0;y<40;++y)for(int x=0;x<64;++x){bool object=x>=12+t && x<32+t && y>=10 && y<30;float v=object?.75f:.3f;
   f.m_id(x,y)=object?1.f:0.f;f.m_normal(x,y)=object?Float3(0,0,-1):Float3(0,0,1);truth(x,y)=Float3(v);f.m_beauty(x,y)=Float3(v+noise(rng));}
  auto filtered=atrous?d.FilterAtrous(f):d.Filter(f);auto result=d.ProcessFrame(f);
  if(t>0){require(d.m_valid(16+t,15),"moving object history retained");require(!d.m_valid(11+t,15),"newly exposed background history rejected");++rejected;}
  for(int y=0;y<40;++y)for(int x=0;x<64;++x){raw+=SqrDistance(f.m_beauty(x,y),truth(x,y));spatial+=SqrDistance(filtered(x,y),truth(x,y));temporal+=SqrDistance(result(x,y),truth(x,y));++count;}
  std::string n=std::to_string(100+t).substr(1);ppm(dir+"/raw-"+n+".ppm",f.m_beauty);ppm(dir+"/truth-"+n+".ppm",truth);ppm(dir+"/filter-"+n+".ppm",filtered);ppm(dir+"/result-"+n+".ppm",result);
 }
 require(spatial<raw*.2,"moving spatial noise reduction");require(temporal<spatial,"moving temporal noise reduction");
 std::ofstream out(dir+"/metrics.json");out<<"{\"fixture\":\"synthetic moving object and disocclusion, not official scenes\",\"frames\":12,\"disocclusion_checks\":"<<rejected<<",\"raw_mse\":"<<raw/(3*count)<<",\"filter_mse\":"<<spatial/(3*count)<<",\"temporal_mse\":"<<temporal/(3*count)<<"}\n";
 std::cout<<"PASS moving sequence/disocclusion noise reduction "<<raw/(3*count)<<" "<<spatial/(3*count)<<" "<<temporal/(3*count)<<"\n";
}

void atrousTests(){
 Denoiser d;auto f=frame(9,9);d.m_sigmaColor=1e6f;
 auto out=d.FilterAtrous(f);for(int y=0;y<9;++y)for(int x=0;x<9;++x)near(out(x,y),Float3(.5f));
 for(int y=0;y<9;++y)for(int x=0;x<9;++x)f.m_beauty(x,y)=Float3(0);
 f.m_beauty(4,4)=Float3(1);out=d.FilterAtrous(f,1);
 // Independent B3 impulse response; center and one off-center tap.
 near(out(4,4),Float3(36.f/256));near(out(3,4),Float3(24.f/256));
 out=d.FilterAtrous(f,2);near(out(4,4),Float3(121.f/4096)); // dilation by two, not repeated dense convolution
 auto edge=frame(8,4);for(int y=0;y<4;++y)for(int x=4;x<8;++x){edge.m_normal(x,y)=Float3(0,0,-1);edge.m_beauty(x,y)=Float3(1);}
 out=d.FilterAtrous(edge);for(int y=0;y<4;++y)for(int x=0;x<8;++x)near(out(x,y),Float3(x<4?.5f:1.f));
 bool bad=false;try{d.FilterAtrous(edge,0);}catch(const std::invalid_argument&){bad=true;}require(bad,"invalid wavelet levels");
 std::cout<<"PASS atrous constant/boundaries, B3 impulse response, normal edge, invalid levels\n";
}
void benchmark(const std::string &dir){
 Denoiser d;auto f=frame(128,80);std::vector<double> b,a;volatile float sink=0;
 for(int i=0;i<5;++i)for(int mode=0;mode<2;++mode){auto start=std::chrono::steady_clock::now();auto out=mode?d.FilterAtrous(f):d.Filter(f);sink+=out(64,40).x;
  double ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();(mode?a:b).push_back(ms);}
 std::sort(a.begin(),a.end());std::sort(b.begin(),b.end());
 std::ofstream out(dir+"/timing.json");out<<"{\"width\":128,\"height\":80,\"repeats\":5,\"bilateral_median_ms\":"<<b[2]<<",\"atrous_median_ms\":"<<a[2]<<",\"speedup\":"<<b[2]/a[2]<<"}\n";
}
int main(int argc,char **argv){try{filterTests();projectionTests();temporalTests();atrousTests();if(argc>1){sequence(argv[1]);movingSequence(std::string(argv[1])+"/moving");sequence(std::string(argv[1])+"/atrous",true);movingSequence(std::string(argv[1])+"/atrous/moving",true);if(argc>2)benchmark(argv[1]);}}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
