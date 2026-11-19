# GAMES202 HW2：PRT

实现环境光l=0..2球谐投影、无阴影/有阴影传输预计算及WebGL PRT。环境积分按cubemap像素立体角加权；传输使用共同等面积Fibonacci球面方向、cosine×visibility，白Lambert响应在离线预览/实时输出统一除pi。只支持单mesh、静态几何和单位反照率，间接反射/SH旋转bonus未实现，不是完整动态全局光照。

球谐系数顺序l*(l+1)+m，对应C++库实基约定。三环境分别GraceCathedral/Indoor/Skybox；1024方向预计算，页面?mode=unshadowed或shadowed选择传输，GUI切换环境。LT按mesh/env缓存，避免每帧分配。离线使用与WebGL同一OBJ，面顶点顺序必须一致，不能替换模型而沿用系数。

远程ci/verify-hw2.sh运行Nori构建、常量/线性环境解析SH、4pi面积、全部传输系数解析cosine卷积、独立矩形遮挡面积积分、ASan/UBSan/泄漏、三环境×两模式真实WebGL及shader点积/Gamma和缓冲复用。最终结论和工件以langnote报告中的最终提交/CI为准；没有本地构建或实验运行。

提交包prt/src与CMakeLists、webgl/src和index、images及data系数。依照题目排除lib/assets/build/ext/include/scenes/PDF。运行/构建时从官方starter恢复prt的ext/include/scenes和webgl的lib/assets；将support/bin2c.cmake放到prt/ext/nanogui/resources/（官方导入缺失该构建脚本），data/{env}中的light.txt及transport-{mode}.txt放到webgl/assets/cubemap/{env}/。需要系统Eigen3和C++17，完整依赖见工作流。模型必须使用webgl/assets/bunny/bunny.obj；重新预计算时将该OBJ复制到scene并引用它。

保存PRT_Unshadowed_和PRT_Shadowed_三环境截图。仅公开自学验证，未提交SmartChair/未取得私有评分；SwiftShader不代表实体GPU性能，低阶SH有过度平滑/负瓣裁切局限，固定几何与normal偏移仍需场景适配。
