# GAMES202 HW0：Blinn-Phong

实现缺失的PhongMaterial并接入OBJ/纹理加载，使用真实GLSL vertex/fragment shader进行Blinn-Phong着色。与原始参考Phong反射向量不同，使用光线与视线的halfway向量；统一世界坐标中的位置、光源、相机，法线使用模型矩阵逆转置，支持非均匀缩放。光强按距离平方衰减，背面不产生镜面高光，纹理sRGB转线性后计算，输出再做gamma编码。

修复原框架中非二次幂纹理REPEAT导致WebGL1不完整纹理、shader优化掉的attribute=-1仍启用的问题。原EmissiveMaterial已存在于Light.js，沿用，不将其记作本人实现。shader编译/链接错误现在抛错，不再只打印后继续。浏览器数学依赖版本2.8.1由CI下载，本地不安装或运行实验。

独立hw0.yml在Ubuntu Actions安装Chromium，真实运行课程Mary OBJ/材质/纹理，检查GL无错误、画面至少5000个有色像素并保存截图。另在真实WebGL离屏画布上运行本材质shader，读取像素与Python独立计算的三组Blinn-Phong结果对照（距离2/4、背面法线，误差最多3/255），验证衰减、镜面与gamma。使用SwiftShader软件GPU，不能据此声称真实硬件GPU性能或正式课程评分。原assignment.pdf和素材未修改；验收证据为最终HEAD的Actions及artifact。

最终验收：ae222dd，Actions 41642012328 完成成功，两个OBJ子网格完整加载；实际WebGL帧缓冲9945个有色像素，GL错误0、JS错误空。三组像素分别119/69/35，与独立预期一致。截图人工复核可见完整Mary角色。首次6d194a7虽绿，但只加载文字子网格且GUI像素造成误判，已废弃该验收；随后10fa218暴露贴图尚未加载的texImage2D错误，通过等待LoadingManager全部纹理完成修复。参考截图和指标保存在hw0-webgl-results artifact。
