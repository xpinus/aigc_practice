# 生成银行卡参考图

请设计一张原创的未来科技感高端银行卡正面视觉。

主题与配色：

- 主题：[深海水母/黑金机械/蓝色数据界面/虹彩生物纹理/未来城市]
- 主色：[填写主色与发光色]
- 虚构品牌：[品牌名称]
- 持卡人：[持卡人姓名]

画面要求：标准横向银行卡比例约1.6:1，完全正视、水平居中，无倾斜和透视变形。完整展示四角及圆角边缘，卡片外为透明背景，输出高清PNG，建议2048x1280，适合作为网页动画素材。

视觉风格：未来金融、赛博科技、奢华克制、电影级产品渲染。使用精密工业材质、细腻金属纹理、全息光泽、微蚀线路、参数标记，柔和边缘高光和轻微发光，呈现真实且不过分夸张的卡片厚度。





# 扫描过卡片的效果

请用 HTML、CSS、JavaScript、Canvas 实现一个可直接运行的银行卡扫描转换网页，并输出完整 index.html、styles.css、script.js。 

多张 400×250px、圆角15px 银行卡从右向左无缝循环移动，页面约 34% 宽度处固定竖直扫描光束。卡片穿过扫描线时，必须是同一张卡连续裁切：左侧实时变成密集 JavaScript 代码，右侧保留原银行卡图片，禁止淡入淡出、固定分屏或整卡瞬间切换。 

每张卡使用两个完全重叠图层： 

```html 
<div class="card-wrapper">
    <div class="card code-layer">
        <pre></pre>
    </div>  
    <div class="card image-layer">
        <img />
    </div>
</div>
```

每帧用 getBoundingClientRect() 计算： 

```js
const progress = Math.max(0, Math.min(1,  (scannerX - cardRect.left) / cardRect.width )); codeLayer.style.clipPath = `inset(0 ${100 - progress * 100}% 0 0)`; imageLayer.style.clipPath = `inset(0 0 0 ${progress * 100}%)`;
```

代码层：深黑背景、10–11px 淡紫等宽字体，动态生成真实 JS 代码并密集铺满，每约 200ms 轻微变化。

扫描线使用白色核心、紫蓝辉光、上下渐隐；卡

片与扫描线相交时增强亮度，并仅在交界处用 Canvas 生成少量白紫粒子，使用 additive/lighter 混合。 

动画使用 requestAnimationFrame，支持无缝循环、鼠标/触摸拖动、惯性和窗口缩放适配。 

图片源： 

const cardImages = [  "./assets/1.png",  "./assets/2.png",  "./assets/3.png",  "./assets/4.png" ]; 

验收：暂停在任意扫描位置，都必须准确看到同一张卡左侧代码、右侧原图无缝衔接且不抖动。请直接输出完整可运行代码并自行检查修正



# 最终网页参考

![ref](assets\ref.png)
