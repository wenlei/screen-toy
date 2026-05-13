<p align="center">
  <img src="src/assets/icon/icon.png" width="96" alt="桌伴 logo">
</p>

<h1 align="center">桌伴</h1>

<p align="center">
  刘看山的桌面生活 · macOS 桌面宠物 + 知乎 AI 助手
</p>

<p align="center">
  <a href="https://github.com/wenlei/screen-toy/releases/tag/v1.0.3">
    <img src="https://img.shields.io/badge/version-v1.0.3-orange?style=flat-square" alt="version">
  </a>
  <a href="https://github.com/wenlei/screen-toy/releases/tag/v1.0.3">
    <img src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square&logo=apple" alt="platform">
  </a>
  <a href="https://github.com/wenlei/screen-toy/releases/tag/v1.0.3">
    <img src="https://img.shields.io/badge/electron-28-47848F?style=flat-square&logo=electron" alt="electron">
  </a>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license">
  <a href="https://wenlei.github.io/screen-toy/">
    <img src="https://img.shields.io/badge/homepage-▸ 网站-d05a28?style=flat-square" alt="homepage">
  </a>
</p>

<p align="center">
  <img src="demo/assets/anims/enter.gif" width="200" alt="enter">
  &nbsp;
  <img src="demo/assets/anims/hula_dance.gif" width="200" alt="hula">
  &nbsp;
  <img src="demo/assets/anims/butterfly.gif" width="200" alt="butterfly">
</p>

---

## 简介

桌伴是一只叫**刘看山**的北极狐，蹲在你的 macOS 桌面上闲逛、打喷嚏、跳呼啦圈。他不只是用来看的——单击弹出快捷菜单，拖拽随意移动，接入知乎直答 API 可以和他对话。

> 知乎 Hackathon 2026 参赛项目

---

## 下载

| 架构 | 下载 |
|------|------|
| Apple Silicon (M1/M2/M3/M4) | [![arm64](https://img.shields.io/badge/下载-Apple_Silicon_.dmg-000?style=flat-square&logo=apple)](https://github.com/wenlei/screen-toy/releases/download/v1.0.3/ZhuoBan-1.0.3-arm64.dmg) |
| Intel Mac | [![x64](https://img.shields.io/badge/下载-Intel_Chip_.dmg-000?style=flat-square&logo=apple)](https://github.com/wenlei/screen-toy/releases/download/v1.0.3/ZhuoBan-1.0.3.dmg) |

首次打开若提示"无法验证开发者"：**系统设置 → 隐私与安全性 → 仍要打开**

---

## 功能

### 🦊 桌面宠物
- 自由拖拽，拖到屏幕边缘会自动睡着
- 随机动画每 20 秒自动触发
- 节日专属动画（端午节、儿童节、母亲节）

### 🎬 动画库

<p>
  <img src="demo/assets/anims/walk.gif" width="100">
  <img src="demo/assets/anims/twist.gif" width="100">
  <img src="demo/assets/anims/sneeze.gif" width="100">
  <img src="demo/assets/anims/melt.gif" width="100">
  <img src="demo/assets/anims/hula_dance.gif" width="100">
  <img src="demo/assets/anims/freeze.gif" width="100">
  <img src="demo/assets/anims/flower1.gif" width="100">
  <img src="demo/assets/anims/bignose.gif" width="100">
  <img src="demo/assets/anims/butterfly.gif" width="100">
</p>

### 🤖 AI 对话
- 知乎直答流式对话
- MBTI 16 型人格风格注入
- 搜索上下文自动折叠展示
- 知乎热榜一键获取

### ⚡ 快捷菜单
- 单击弹出，一键打开常用应用
- 可自由配置应用列表

---

## 开发

```bash
git clone https://github.com/wenlei/screen-toy.git
cd screen-toy
npm install
npm run dev
```

**打包**

```bash
npm run dist        # macOS (arm64 + x64)
```

**技术栈**

![Electron](https://img.shields.io/badge/Electron-28-47848F?style=flat-square&logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript)
![Canvas API](https://img.shields.io/badge/Canvas_API-sprite_animation-orange?style=flat-square)

---

## 项目结构

```
electron/       主进程 (main.ts, agent.ts, preload.ts)
src/
  panels/       设置、对话、菜单等面板
  assets/       精灵图、图标
  renderer.js   动画状态机
  behavior.js   行为 AI
demo/           GitHub Pages 网站
```

---

## 链接

- 🌐 [官网](https://wenlei.github.io/screen-toy/)
- 📖 [知乎项目介绍](https://www.zhihu.com/hackathon/project/90009)
- 📦 [Releases](https://github.com/wenlei/screen-toy/releases)
