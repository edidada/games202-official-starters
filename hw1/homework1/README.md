# GAMES202 HW1：实时阴影

从官方 2021 starter 实现 SM、圆盘 PCF 与 PCSS。浏览器通过静态 HTTP 服务打开 index.html；右上角选择 SM/PCF/PCSS/Unshadowed。默认 PCSS，两个 Mary 模型和地面保持原场景。

## 算法与单位

光源视图使用 lookAt，正交范围 x/y 各 [-100,100]，near=1、far=300，模型矩阵为 T*S。投影后除 w，再将 [-1,1] 映射到 [0,1]。阴影缓冲每帧仅清一次，多个模型共享深度测试。

深度保存为 RGBA，读取后比较 receiver-bias 与最近深度；超出光源视锥按可见处理。PCF 先做各采样的比较再平均，固定半径 4/2048 UV。PCSS 先搜索遮挡物，无 blocker 返回可见，平均深度还原为 near+depth*(far-near)，以半径5的有限平面光源近似，半影半径=5*(receiverZ-blockerZ)/blockerZ，再除以正交平面宽200转为 UV；不会直接以归一化深度比充当物理距离比。该有限尺寸源模型用于方向光框架的软阴影近似，不是无限远方向光的精确面积积分。

32 个确定性圆盘样本用于 blocker/PCF，固定 bias=0.0008；不是通用消除 acne/peter-panning 的方案。高精度 fragment float 用于 RGBA 深度运算。材质按作业公式将可见性乘到 Blinn-Phong 结果，包含框架的 ambient。

## 验证与边界

ci/verify-hw1.mjs 只在 GitHub Actions 运行。Chromium/SwiftShader 真实编译 shader；人工半平面深度纹理覆盖硬阴影、无遮挡、视锥外、PCF 和不同接收距离 PCSS，检查软边宽度随距离增加；官方完整场景逐帧读回并与无遮挡对照。独立 edidada/hw1 和 hw1.yml，不在本地编译运行。

当前结果待最终 CI 与图像查看后补入 langnote。未取得 SmartChair 评分；多光源/动态物体 bonus 尚未实现。提交包按题要求排除 lib/assets/assignment1.pdf，运行时需将官方 starter 的 lib/assets 放回同级目录；images 保存 SM_、PCF_、PCSS_ 截图。

## 官方框架原 README（保留）

# GAMES202 homework0

## Usage

### For Visual Studio Code
Install plugin `Live Sever` and run with `index.html` directly

### For Node.js users
To install:
```
npm install http-server -g
```
To run(from `index.html` directory):
```
http-server . -p 8000
```

## In-web operation
- Hold right mouse to rotate the camera
- Scroll mouse wheel to zoom in/out
- Hold left mouse to move the camera
- Hold left mouse only to drag the GUI