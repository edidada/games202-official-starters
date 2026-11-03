# GAMES202 HW0：Blinn-Phong

实现缺失的PhongMaterial并接入OBJ/纹理加载，使用真实GLSL vertex/fragment shader进行Blinn-Phong着色。与原始参考Phong反射向量不同，使用光线与视线的halfway向量；统一世界坐标中的位置、光源、相机，法线使用模型矩阵逆转置，支持非均匀缩放。光强按距离平方衰减，背面不产生镜面高光，纹理sRGB转线性后计算，输出再做gamma编码。

修复原框架中非二次幂纹理REPEAT导致WebGL1不完整纹理、shader优化掉的attribute=-1仍启用的问题。原EmissiveMaterial已存在于Light.js，沿用，不将其记作本人实现。shader编译/链接错误现在抛错，不再只打印后继续。浏览器数学依赖版本2.8.1由CI下载，本地不安装或运行实验。

独立hw0.yml在Ubuntu Actions安装Chromium，真实运行课程Mary OBJ/材质/纹理，检查GL无错误、画面至少500个有色像素并保存截图。另在真实WebGL离屏画布上运行本材质shader，读取像素与Python独立计算的三组Blinn-Phong结果对照（距离2/4、背面法线，误差最多3/255），验证衰减、镜面与gamma。使用SwiftShader软件GPU，不能据此声称真实硬件GPU性能或正式课程评分。原assignment.pdf和素材未修改；验收证据为最终HEAD的Actions及artifact。
