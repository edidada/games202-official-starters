#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <stdexcept>
namespace hw4 {
constexpr double pi=3.14159265358979323846;
using V=std::array<double,3>;
inline double dot(V a,V b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
inline V unit(V a){double n=std::sqrt(dot(a,a));if(n==0)throw std::invalid_argument("zero vector");for(auto &x:a)x/=n;return a;}
inline double radical(uint32_t i){double x=0,w=.5;while(i){x+=double(i&1)*w;i>>=1;w*=.5;}return x;}
inline double D(double nh,double rough){if(nh<=0)return 0;const double a=std::max(rough*rough,1e-8),a2=a*a;const double d=(1-nh*nh)+nh*nh*a2;return a2/(pi*d*d);}
inline double G1(double cosine,double rough){if(cosine<=0)return 0;const double k=(rough+1)*(rough+1)/8;return cosine/(cosine*(1-k)+k);}
inline double G(double nv,double nl,double rough){return G1(nv,rough)*G1(nl,rough);}
inline double F(double f0,double vh){return f0+(1-f0)*std::pow(1-std::clamp(vh,0.0,1.0),5);}
inline double single(V v,V l,double rough,double f0=1){if(v[2]<=0||l[2]<=0)return 0;V h=unit({v[0]+l[0],v[1]+l[1],v[2]+l[2]});return F(f0,dot(v,h))*D(h[2],rough)*G(v[2],l[2],rough)/(4*v[2]*l[2]);}
struct Integral {double energy=0,A=0,B=0;};
inline Integral integrate(double mu,double rough,int samples,bool importance){
 if(!(mu>0&&mu<=1&&rough>0&&rough<=1&&samples>0))throw std::invalid_argument("invalid integral parameters");
 V v={std::sqrt(1-mu*mu),0,mu};Integral sum;
 for(int i=0;i<samples;i++){
  const double u=(i+.5)/samples,phi=2*pi*radical(uint32_t(i));V h,l;double weight;
  if(importance){const double a=rough*rough;const double z=std::sqrt((1-u)/(1+(a*a-1)*u));const double r=std::sqrt(std::max(0.0,1-z*z));h={r*std::cos(phi),r*std::sin(phi),z};double vh=dot(v,h);l={2*vh*h[0]-v[0],2*vh*h[1]-v[1],2*vh*h[2]-v[2]};if(l[2]<=0||vh<=0)continue;weight=vh*G(mu,l[2],rough)/(mu*h[2]);}
  else {const double z=std::sqrt(1-u),r=std::sqrt(u);l={r*std::cos(phi),r*std::sin(phi),z};h=unit({v[0]+l[0],v[1]+l[1],v[2]+l[2]});weight=pi*single(v,l,rough);}
  const double fc=std::pow(1-std::clamp(dot(v,h),0.0,1.0),5);
  sum.energy+=weight;sum.A+=weight*(1-fc);sum.B+=weight*fc;
 }
 sum.energy/=samples;sum.A/=samples;sum.B/=samples;return sum;
}
inline double compensation(double ei,double eo,double eavg,double favg){
 if(eavg>=1-1e-8)return 0;
 return (1-ei)*(1-eo)/(pi*(1-eavg))*favg*eavg/std::max(1-favg*(1-eavg),1e-12);
}
}
