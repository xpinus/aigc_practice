# 机械音效素材说明 / Mechanical SFX credits

本目录的 5 个 WAV 全部由**真实录音素材**裁切、频谱降噪、分层与电平平衡而成，
没有任何由代码合成的假音效（无振荡器 / 无噪声生成）。

All five WAVs are edits of real field recordings (trim, spectral denoise, layering,
gain staging). Nothing is synthesised in code.

素材库 / Source library: **freesfx.co.uk** (Sound Ideas)
授权 / License: free for commercial and non-commercial use, credit required —
`Sound effects from https://www.freesfx.co.uk/`

| 输出文件 | 用途 | 采用的真实录音素材（freesfx.co.uk） |
| --- | --- | --- |
| `finder_open.wav` | 取景器弹开（弹簧释放 + 四片折页展开） | Open Shackle (18041)、Clamping Metal Clasp Lid on Glass Jar (18265)、Slide Window Open (16306)、Latch Lock (16954) |
| `finder_close.wav` | 取景器合上（折页收拢 + 前盖落座 + 卡榫咬合） | Slide Window Close (16305)、Clamping Metal Clasp Lid on Glass Jar (18265)、Television Channel Knob Clicks (16797)、Lock Shut or Open Briefcase (13797)、Latch Lock (16954) |
| `crank_wind.wav` | 过片拨杆旋转（连续过片机构声） | Wind Up Clock (16448) 棘轮上弦、35mm Camera Four Takes of Shutter and Wind Mechanism (13869) 真实相机过片机构、Television Channel Knob Clicks (16794) 停位 |
| `ratchet.wav` | 棘轮定位声（与拨杆角速度同步的 8 次齿声） | Television Channel Knob Clicks (16793 / 16794 / 16795 / 16796 / 16797) |
| `lock.wav` | 最终锁定咔哒（画面切换完成瞬间触发） | Close Shackle (18043)、Lock Bolt Securing Pin for Metal Cage (18053)、Latch Lock (16954) |

## 与动画时间轴的对齐 / Timeline alignment

时间基准来自 `assets/camera.glb` 的两条动画轨（24 fps，`Finder_OpenClose` 在页面中以 2× 速度播放）：

- 拨杆 `Crank_Wind`：t=0.167s 起转，两整圈（720°）到 t≈0.958s，t=1.417s 完全静止。
  `crank_wind.wav` 前 0.167s 为静音引导，过片声覆盖 0.167–0.90s；
  `ratchet.wav` 的 8 次齿声由拨杆实际角位移反推（角度每增加 80° 触发一次），因此齿声密度自动跟随"中间快、两头慢"的转速曲线。
- 取景器 `Finder_OpenClose`：
  - 合上 0 → 0.825s（侧壁 0.471s、前壁 0.596s、顶盖 0.7625s 到位）→ `finder_close.wav` 的卡榫声落在 0.752s。
  - 弹开 0 → 0.675s（顶盖 0.125s 起、侧壁 0.375s 起）→ `finder_open.wav` 的弹簧释放落在 0.000s、侧壁落座 0.468s；
    `lock.wav` 由 JS 在 0.675s（取景器完全打开、新画面显示完成）这一帧精确触发。

构建脚本（可复现）：`.generate/camera/audio_tools/build_sfx.py`
