# 现况界面清单

记录对象是 2026-11-25 的线上页面 `https://roukeiyu.github.io/LinkBlock/`，以及仓库里实际画出这套界面的文件。截图在 `captures/current/`，桌面 1440×900，手机 390×844。胜利、失败两张是线上真实弹层（火漆、破纸边、按钮都是游戏自己的），文案按 `src/main.ts` 在结算时写入的句子填上，因为那两句要打完整局才会出现。

## 画面

| 画面 | 怎么出现 | 截图 |
| --- | --- | --- |
| 主菜单 | 打开游戏 | `desktop-01-menu`、`mobile-01-menu`；有进度时 `*-11-menu-progress` |
| 设置 | 主菜单「设置」 | `*-02-settings` |
| 选关 | 「选择关卡」 | `*-03-level-select`；有进度 `*-12-level-select-progress` |
| 图鉴 | 「图鉴」 | 全锁 `*-04-gallery-locked`；有解锁 `*-13-gallery-mixed` |
| 大图 | 点开已解锁画像 | `*-14-viewer` |
| 攻略 | 「关卡攻略」 | `*-05-guide` |
| 清空进度 | 设置里的确认框 | `*-06-clear-confirm` |
| 局内 | 「开始游戏」，选起点 | `*-07-gameplay` |
| 暂停 | 暂停 | `*-08-pause` |
| 胜利 / 失败 | 同一弹层，不同文案 | `*-09-win`、`*-10-lose` |
| 审阅 · 奖励 | `/review/rewards.html` | `*-15-review-rewards`，钟械秘阁一段 `*-16-review-clockwork` |
| 审阅 · 放大 / 遮罩 | 点图、查看 Alpha | `*-17-review-lightbox`、`*-18-review-mask` |
| 审阅 · 敌人 / 头脸 | 仅桌面抽查 | `desktop-19-review-enemies`、`desktop-20-review-faces` |

手机竖屏会收起侧栏，改成单手摇杆。桌面横屏则把顶栏收成一行，场地尽量占满高度。

## 文件归属

游戏结构在 `src/main.ts` 开头那一段模板：主菜单、顶栏、净化条、场地框、触控、弹层、图鉴、攻略、选关、清空确认。图标是同文件里的内联 SVG。

视觉几乎全在 `src/style.css`。这个文件是叠出来的，后面的规则盖住前面的：

1. 开头是深色街机皮：薄荷色 `--mint:#79edc9`，背景 `#0a1219`，无衬线。
2. 中段改成「封印」皮：`--seal` 随关卡变色，圆头像、护符、金线进度。
3. 从「Grimoire chrome」起才是现在看到的样子：羊皮纸、破纸边、火漆、宋体。线上生效的是这一层。

字体入口在 `index.html`：只链了 `Noto Serif SC` 500/700。`theme-color` 为 `#2a1c12`。

审阅页不走这套 CSS。`scripts/export-art-review.mjs` 把样式写进 `review/rewards.html` 和 `review/enemies.html`。头脸页由 `scripts/export-face-review.mjs` 另写 `review/faces.html`。

界面用图在 `public/ui/`：`main_menu.webp`、`logo.png`、`torn-parchment.webp`、`page_frame.webp`、`parchment_tile.webp`、`wax_seal_red.png`、`wax_seal_broken.png`、`wax_seal_gold.png`、`ink_divider.png`。角色图不在这份清单里。

## 现在生效的颜色

| 用途 | 值 | 出处 |
| --- | --- | --- |
| 页面底 | `#120c08`，顶上 `#3a2618` 径向晕 | `body` 在 grimoire 段 |
| 墨色字 | `--ink:#24160c` | 同上 |
| 羊皮底纹 | `#7c5a34` 叠噪点 SVG，再叠 `--parchment` | `.site-header, .game-main, …` |
| 金 / 朱按钮 | 渐变 `#f6e6c4 → #c9965a`，描边 `#3a2414` | `button.ink-tab`、`.primary-button` |
| 主菜单主按钮 | `#6c3c1e → #492916`，字 `#fff0cb` | `.menu-btn.menu-primary` |
| 未解锁图鉴底 | `#8d6840 → #2a160c`，虚线 `#e7c27a` | `.sealed-plate` |
| 弹层遮罩 | `rgba(18,8,4,.78)` | `#modal-shade` |
| 关卡点缀 `--seal` | 每关一个，如月下 `#c5d4e6`、月蚀 `#8b3a4a`、万象 `#e6d39a` | `src/levels.ts` 的 `accent` |

`--seal` 仍被进度条、个别描边引用，但羊皮纸层把大部分面板刷成褐色，所以关卡色在界面上几乎看不出来。早期薄荷色 `#79edc9`、面板 `#101b24`、危险粉 `#f18d8e` 还留在文件前半，已被盖住。

审阅页是另一套：底 `#19191d`，字 `#eee8dd`，链接金 `#ebcb8e`，卡片 `#232329`，描边 `#645a48`，形态按钮 `#584024`。

## 字体与字号

全游戏控件在 grimoire 段被改成：

`Noto Serif SC, Songti SC, STSong, SimSun, Palatino, Times New Roman, serif`

标题、按钮、数字都用这套宋体。没有单独的黑体。

| 角色 | 字号 | 字距 |
| --- | --- | --- |
| 主菜单标语 | 18px（竖屏 13px / 11px） | `0.3em`，竖屏收到 `0.22em` |
| 主菜单主按钮 | 23px | `0.22em` |
| 主菜单次按钮 | 16px，说明 10px | `0.1em` / `0.16em` |
| 选关标题 | 16px | `0.22em` |
| 选关关名 | 14px | `0.04em` |
| 弹层标题 | 30px，矮屏 22px | `2px`（来自更早的 `.overlay h2`） |
| 顶栏墨钮 | 12px，高 30px | `0.12em` |
| 眉题 `.eyebrow` | 9px | `2px` |
| 审阅页标题 | `clamp(25px, 3vw, 34px)` | `0.05em` |
| 审阅正文 | 15px / 1.65，系统黑体 | 无 |

中文被拉得很开，尤其标语和选关标题。小字也是宋体，12px 以下笔画糊在一起。

## 间距、圆角、阴影

没有统一的间距刻度。常见空隙是 4、6、8、10、12、14、16、18、22、28。主菜单两栏间距 `clamp(28px, 7vw, 100px)`。

圆角很杂：主按钮几乎是方的（`2px`），墨钮 `3px 9px` 不对称，图鉴卡片 `12px`，选关在窄纸上是 `8px`，摇杆盘 `16px`，生命和护符是正圆。弹层和主菜单纸页用 `border-image`，圆角被取消。

阴影主要是纸页的 `drop-shadow(0 14px 20px #180b0870)` 和弹层的 `drop-shadow(0 6px 16px #0006)`。按钮还有多层内高光。蜡烛有一块 `mix-blend-mode: screen` 的暖光。

## 组件

**主按钮。** `.menu-btn.menu-primary` 与 `.primary-button`。深褐渐变或金褐渐变，字距大，左侧可嵌火漆。按下时下移 1px。

**墨钮。** `button.ink-tab`。金箔渐变、不对称圆角、内描边。顶栏、弹层次按钮、审阅返回都用它。窄屏会把文字藏掉，只留图标。

**菜单项。** `.menu-btn`，两列。选中或悬停时左边出现一条 `#8a3427`。

**开关与滑条。** `.toggle` 是皮面轨道加热蜡圆点；滑条轨道是 `#6a4a2c → #2e1c10`，圆头是金色径向渐变。数值默认音乐 62、音效 78。

**进度。** 主菜单是 10 列火漆，共 20 枚。局内是 `.purity-bar`：槽高约 10px，填充随 `--seal`，右侧白线表示目标，百分比在槽外。

**选关。** `.level-select .gallery-card` 宽 `clamp(240px, 28vw, 300px)`，高约 330–360px。20 关在里面滚动，一屏大约六行。行内是火漆、关名、难度和首领名。未解锁 `disabled`，透明度约 0.45。

**图鉴。** 每关三张，长卷向下排。未解锁是褐色虚线板中央一枚火漆，不是把原图压暗。已解锁直接显示原图。

**弹层。** `#overlay` 里的 `.overlay-card`，破纸边 24px。眉题在暂停、胜利、失败时是英文：`TAKE A BREATH`、`SEAL BROKEN`、`EVERY TRY IS A NEW BEGINNING`。标题仍是中文。

**局内框。** `.frame-fit` 用 `--page-frame` 和关卡色混合。顶栏在横屏收成 46px 左右。底部状态、用时、提示在 `.board-footer`。

**手机操作。** 宽 620px 且竖屏时出现。默认单手摇杆：盘 144px（矮屏 108px），钮是薄荷到金色的径向渐变。可切成十字键加圆形画线钮。横屏矮屏则把状态挤进左侧 112px 列。

**审阅。** 深色工具页。三列图（窄屏一列），右侧贴边的形态坞，放大层支持左右切图。奖励页另有 Alpha 遮罩层。和游戏不是同一套组件。

## 动效

- 按钮颜色与位移 `0.18s`；进度宽度 `0.25s`；开关圆点 `0.2s`。
- 受击时 `.hud-pulse` 放大到 1.16。
- 胜利火漆 `.seal-break` 0.7s。
- 菜单蜡烛 `flicker` 2.6s 循环；尘点 `rise` 直线上升。
- `prefers-reduced-motion: reduce` 时关掉过渡。尘点动画不在这条规则的 `transition` 里，仍会动。

## 文案语气

中文短句是这套界面最好的部分，提案保留：

- 标语：沿岸而行，以线解封。
- 邀请：翻开新的一页。
- 胜利：封印解开了。
- 暂停：风景会等你。
- 失败：下一次，再远一点。

英文眉题、宋体小字、二十枚重复火漆、以及只露六关的选关纸条，是这次提案要换掉的部分。
