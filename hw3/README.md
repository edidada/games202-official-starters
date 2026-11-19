# GAMES202 HW3：Screen Space Ray Tracing

实现直接漫反射光照、固定步长SSR和一次间接反弹。通过HTTP服务打开index.html，?scene=cube1/cube2/cave选择官方场景；GUI的Direct/Combined/Indirect/Mirror切换直接、直接加间接、间接与镜面命中颜色调试。

EvalDiffuse返回线性反照率/pi并检查入射/出射半球，直接光另乘接收cos和shadow可见性。GBuffer深度为camera clip.w（正向视深度），阴影使用0..1归一化深度且空纹素清为1。SSR以世界单位0.1最多128步，在候选交叉处二分8次；厚度0.15，排除距离起点<0.08、候选离射线>0.18及背面候选。起点沿normal偏移0.01。16条cosine半球采样估计间接项，明确乘接收cos/pdf和命中位置的直接光；每帧随机种子固定为像素hash，便于复现。

本实现只有屏幕中可见几何，没有屏外/被遮挡背面信息；固定步长与厚度会漏薄面/近面或错误接受不连续处，不能替代完整光追。16样本仍有噪声，输出Gamma前裁切到0..1，强光会饱和。Mipmap/Hi-Z优化bonus未实现，未加入时间累积或降噪，不声称实时性能。

ci/verify-hw3.mjs仅在GitHub Actions执行真实WebGL场景、独立平面RayMarch命中/未命中、直接光辐射度与可见性解析对照，并导出images及排除lib/assets/PDF的源码包；独立解压后恢复官方lib/assets再复现三场景四模式完整RGBA。实际最终验收以langnote报告的最终提交/成功CI和图像复核为准。本地只编辑和静态检查，未运行实验。

源码包按题排除lib/assets/assignment3.pdf；运行时从官方starter恢复lib/assets，与src/index.html同级。需要WebGL1 OES_texture_float、WEBGL_color_buffer_float和至少5个draw buffers；CI使用匹配Playwright版本的官方容器/SwiftShader。未提交SmartChair或取得私有评分。
