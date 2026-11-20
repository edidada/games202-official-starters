# GAMES202 HW5

实现联合双边滤波、对象/相机运动重投影和7×7方差钳制的时间累积。背景无历史时保留当前帧，尺寸改变时重新初始化；历史ID不匹配或投影越界时拒绝。使用最后一个world-to-screen矩阵，不重复应用camera矩阵。基础滤波半径16，新增À-Trous bonus，验证结果以Actions为准。

远端验证入口 `bash ci/verify-hw5.sh`：普通及ASan/UBSan/leak构建，独立核积分、对象/相机运动、边界/ID、方差与EMA解析检查，12帧合成双法线边缘序列和视频。合成测试不代替官方box/pink-room验收，官方数据仍待获取；源码包独立复现纳入Actions检查，官方视频尚未完成，不声明全部完成。

本地未编译/运行实验。使用cmake配置后运行Denoise；命令 `Denoise INPUT_DIRECTORY OUTPUT_DIRECTORY FRAME_COUNT [bilateral|atrous]` 可处理两种场景，自动创建输出目录。依赖C++17/OpenMP/zlib。

官方数据公告：https://games-cn.org/forums/topic/zuoye5fabugonggao/ ，数据百度网盘 https://pan.baidu.com/s/1HojLh4-edPqUS07R3qAdPg 提取码7h3z。尚未取得数据。


源码包 `edidada_Homework5.zip` 包含src（排除ext第三方库）、tests、CMakeLists、README和results视频。新目录解压后，从官方同一starter的 `hw5/src/ext` 恢复到 `src/ext`，再用 `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release` 和 `cmake --build build`。CI会实际执行此流程，OMP=1重跑两组合成完整图像、数值和EXR，与原OMP=2结果比较。results中的三段视频明确为合成测试，不是官方box/pink-room。

新增12帧移动对象/显露背景测试，逐帧检查对象历史保留与ID不匹配背景拒绝。当前重投影按题目只用屏幕范围和ID检查，不声称能拒绝同ID自身遮挡或全部几何不连续。


À-Trous：可选`atrous`模式，5层步长1/2/4/8/16，5×5 B3-spline [1,4,6,4,1]外积核，每层使用上一层颜色、固定法线/位置作边缘权重；保留基础题核的法线夹角和平面度量，空间项改为小波核。最多125个邻域tap/像素，双边版内点1089；两者支撑与结果不同，不能声称精确替换。参考 Dammertz等HPG2010的edge-avoiding à-trous结构：https://doi.org/10.2312/EGGH/HPG10/067-075 。固定合成图测5次中位耗时，同时保留两算法的完整噪声/运动/EXR与包复现验证，未外推硬件实时性能。
