# GAMES202 HW5

实现联合双边滤波、对象/相机运动重投影和7×7方差钳制的时间累积。背景无历史时保留当前帧，尺寸改变时重新初始化；历史ID不匹配或投影越界时拒绝。使用最后一个world-to-screen矩阵，不重复应用camera矩阵。基础滤波半径16，尚未实现À-Trous bonus。

远端验证入口 `bash ci/verify-hw5.sh`：普通及ASan/UBSan/leak构建，独立核积分、对象/相机运动、边界/ID、方差与EMA解析检查，12帧合成双法线边缘序列和视频。合成测试不代替官方box/pink-room验收，官方数据仍待获取；尚未完成作业提交包与官方视频，不声明全部完成。

本地未编译/运行实验。使用cmake配置后运行Denoise；当前main仍保留官方默认examples/box/input路径。依赖C++17/OpenMP/zlib。
