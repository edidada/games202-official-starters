# GAMES202 HW4：Kulla-Conty BRDF

实现基础余弦半球E(mu)、Eavg、GGX微表面PBR和Kulla-Conty补偿；另实现GGX重要性采样和Split Sum。离线/实时统一alpha=roughness²、Smith-Schlick k=(roughness+1)²/8。按官方PDF第10页，fadd=Favg*Eavg/[1-Favg*(1-Eavg)]，未使用另一些资料中的Favg平方形式；Favg采用框架给出的Imageworks近似并夹在0..1。

LUT默认128×128、4096确定性Hammersley样本；横坐标mu，纵坐标roughness，PNG顶行为高roughness。原始CSV保留积分值及A/B，A+B=E，F0*A+B重建Schlick响应。余弦方法低粗糙度有高方差，PNG显示会夹到0..1且输出裁切数量；实时使用重要性采样图。Eavg由量化E图的2*E(mu)*mu行积分生成，同行恒定；PNG数据不作Gamma转换。IS Split Sum图RGB依次A、B、E。

实时上下两排分别Kulla/PBR，粗糙度0.15/0.35/0.55/0.75/0.95。按同一几何开关补偿比较；整球色调映射均值不是半球能量，不要求跨粗糙度画布均值比单调。独立GPU固定方向的BRDF/补偿/显示公式验证和CPU半球积分/白色炉验证各自覆盖相应范围。

只在Actions构建和运行：普通与ASan/UBSan/leak测试、12组独立半球能量/有色Split Sum积分、NDF归一化、白炉/互易/边界、完整LUT量化坐标与Eavg行，以及实际WebGL公式与球体。最终验收以langnote最终HEAD报告和CI为准。本地仅编辑/静态/Git及工件查看。

源码包依题排除build/ext/lib/assets/PDF。从官方starter恢复lut-gen/ext及webgl/lib、webgl/assets；把images/GGX_E_LUT.png及GGX_Eavg_LUT.png复制到webgl/assets/ball/，通过HTTP服务打开webgl/index.html。C++用CMake构建lut-gen，依次运行lut-Emu-MC、lut-Eavg-MC、lut-Emu-IS、lut-Eavg-IS（后二者用于实时）。images含LUT和实时图，data含未量化CSV。支持生成器参数resolution/samples，默认128/4096；本提交对照覆盖题目指定模型，不声称通用材质/所有角度严格能量守恒或实体GPU性能。未提交SmartChair/私有评分。
