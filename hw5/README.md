# GAMES202 HW5

实现联合双边滤波、对象/相机运动重投影和7×7方差钳制的时间累积。背景无历史时保留当前帧，尺寸改变时重新初始化；历史ID不匹配或投影越界时拒绝。使用最后一个world-to-screen矩阵，不重复应用camera矩阵。基础滤波半径16，尚未实现À-Trous bonus。

远端验证入口 `bash ci/verify-hw5.sh`：普通及ASan/UBSan/leak构建，独立核积分、对象/相机运动、边界/ID、方差与EMA解析检查，12帧合成双法线边缘序列和视频。合成测试不代替官方box/pink-room验收，官方数据仍待获取；尚未完成作业提交包与官方视频，不声明全部完成。

本地未编译/运行实验。使用cmake配置后运行Denoise；命令 `Denoise INPUT_DIRECTORY OUTPUT_DIRECTORY FRAME_COUNT` 可处理两种场景，自动创建输出目录。依赖C++17/OpenMP/zlib。

官方数据公告：https://games-cn.org/forums/topic/zuoye5fabugonggao/ ，数据百度网盘 https://pan.baidu.com/s/1HojLh4-edPqUS07R3qAdPg 提取码7h3z。尚未取得数据。


源码包 `edidada_Homework5.zip` 包含src（排除ext第三方库）、tests、CMakeLists、README和results视频。新目录解压后，从官方同一starter的 `hw5/src/ext` 恢复到 `src/ext`，再用 `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release` 和 `cmake --build build`。CI会实际执行此流程，OMP=1重跑两组合成完整图像、数值和EXR，与原OMP=2结果比较。results中的两段视频明确为合成测试，不是官方box/pink-room。

新增12帧移动对象/显露背景测试，逐帧检查对象历史保留与ID不匹配背景拒绝。当前重投影按题目只用屏幕范围和ID检查，不声称能拒绝同ID自身遮挡或全部几何不连续。
