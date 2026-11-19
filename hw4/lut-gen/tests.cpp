#include "brdf.h"
#include <iostream>
#include <iomanip>
#include <cstdlib>
using namespace hw4;
void require(bool ok,const char *message){if(!ok)throw std::runtime_error(message);}
// Independent midpoint quadrature in incident cosine/azimuth coordinates.
double reference(double mu,double rough,double f0=1){
 const int nz=512,np=1024;double sum=0;
 const V v={std::sqrt(1-mu*mu),0,mu};
 for(int z=0;z<nz;z++)for(int p=0;p<np;p++){
  const double nl=(z+.5)/nz,phi=2*pi*(p+.5)/np,s=std::sqrt(1-nl*nl);
  const V l={s*std::cos(phi),s*std::sin(phi),nl};
  V h={v[0]+l[0],v[1]+l[1],v[2]+l[2]};double length=std::sqrt(h[0]*h[0]+h[1]*h[1]+h[2]*h[2]);for(auto &x:h)x/=length;
  const double a2=rough*rough*rough*rough,den=1+(a2-1)*h[2]*h[2],ndf=a2/(pi*den*den),k=(rough+1)*(rough+1)/8;
  const double masking=mu/(mu*(1-k)+k)*nl/(nl*(1-k)+k),vh=v[0]*h[0]+v[1]*h[1]+v[2]*h[2];
  const double fresnel=f0+(1-f0)*std::pow(1-vh,5);
  sum+=ndf*masking*fresnel/(4*mu);
 }
 return sum*2*pi/(nz*np);
}
int main(){try{
 std::cout<<std::setprecision(12);double worst=0;
 for(double rough:{.5,.8,1.0})for(double mu:{.2,.5,.9}){
  const double ref=reference(mu,rough);const auto is=integrate(mu,rough,65536,true),mc=integrate(mu,rough,65536,false);
  require(std::abs(is.energy-ref)<.015,"GGX estimator quadrature mismatch");require(std::abs(mc.energy-ref)<.015,"cosine estimator quadrature mismatch");
  require(std::abs(is.A+is.B-is.energy)<1e-12,"split sum partition");
  const double colored=reference(mu,rough,.37);require(std::abs(.37*is.A+is.B-colored)<.015,"colored split sum mismatch");
  worst=std::max(worst,std::abs(is.energy-ref));std::cout<<"QUADRATURE rough="<<rough<<" mu="<<mu<<" reference="<<ref<<" IS="<<is.energy<<" MC="<<mc.energy<<" split_colored="<<.37*is.A+is.B<<std::endl;
 }
 for(double rough:{.25,.5,1.0}){
  double sum=0;const int n=200000;for(int i=0;i<n;i++){double z=(i+.5)/n;sum+=D(z,rough)*z*2*pi/n;}
  require(std::abs(sum-1)<1e-4,"NDF normalization");
 }
 for(double mu:{.2,.5,.9}){
  const double eo=.3+.5*mu,eavg=.3+1.0/3;double added=0;
  for(int i=0;i<10000;i++){double nl=(i+.5)/10000,ei=.3+.5*nl;added+=compensation(ei,eo,eavg,1)*nl*2*pi/10000;}
  require(std::abs(eo+added-1)<1e-8,"white furnace energy not restored");require(compensation(.2,.5,eavg,0)==0,"zero Fresnel");require(compensation(.2,.5,1,1)==0,"no loss limit");
  require(std::abs(compensation(.2,.5,eavg,.7)-compensation(.5,.2,eavg,.7))<1e-14,"reciprocity");
 }
 require(F(.04,0)==1&&F(.04,1)==.04,"Fresnel endpoints");
 int invalid=0;for(auto p:std::array<std::array<double,3>,4>{{{0,.5,16},{1,0,16},{1,.5,0},{1,2,16}}})try{integrate(p[0],p[1],int(p[2]),true);}catch(const std::invalid_argument &){invalid++;}
 require(invalid==4,"invalid parameters accepted");std::cout<<"PASS 9 energy/colored quadratures, 3 NDF integrals, 3 white furnaces, reciprocity/Fresnel/limits; worst_IS="<<worst<<std::endl;return 0;
 }catch(const std::exception &e){std::cerr<<e.what()<<std::endl;return 1;}}
