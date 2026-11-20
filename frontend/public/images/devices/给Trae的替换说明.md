# 家电实物图片替换

本文件夹提供空调、冰箱、滚筒洗衣机和电视四类实物透明背景 PNG。直接使用本地文件，不要依赖远程图片链接。

| 页面类别 | 文件 |
| --- | --- |
| 空调、客厅空调 | air-conditioner.png |
| 冰箱 | refrigerator.png |
| 洗衣机、滚筒洗衣机 | washing-machine.png |
| 其他家电 | television.png |

把图片复制到网站 public/images/devices/ 下，并在顶部设备选择卡片、下方已有设备卡片中统一替换对应 emoji。保留原有点击行为、设备名称、状态和说明。

使用 object-fit: contain，不裁切，不拉伸。建议选择卡片中图片展示区域为 112×76px，已有设备卡片中为 80×80px；手机端可缩至 64×64px。空调横向比例较宽，适当增加它的展示宽度，不要强制把所有设备填满同一个正方形。

示例：

```html
<img src="/images/devices/air-conditioner.png" alt="空调" width="112" height="76" style="object-fit:contain" />
```

冰箱图片为对开门加底部抽屉的典型家用冰箱，仅作为设备类别示意，不表示用户实际型号。电视代表“其他家电”，不是所有其他家电的实物集合。

## 图片来源与使用条件

原始产品抠图来自 PNGimg。逐图原始链接、尺寸和透明通道核验结果保存在 manifest.json。使用的是已经抠好的原图，无需再次去白底。

- 空调：https://pngimg.com/uploads/air_conditioner/air_conditioner_PNG76.png
- 冰箱：https://pngimg.com/uploads/refrigerator/refrigerator_PNG101556.png
- 洗衣机：https://pngimg.com/uploads/washing_machine/washing_machine_PNG101471.png
- 电视原始参考：https://pngimg.com/uploads/tv/tv_PNG477.png

图库声明采用 CC BY-NC 4.0（署名、非商业），见 https://pngimg.com/license 。公开展示时请保留来源和许可信息；本素材包不是商业授权证明。

电视另经内置图像编辑工具修复为完整黑屏，编辑记录见 television-edit.txt。其他三张保留下载原图。
