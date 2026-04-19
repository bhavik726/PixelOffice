# PixelOffice 🏢✨

*A Real-Time 2D Virtual Office Experience*

<p align="center">
  <img src="frontend/public/logo.png" width="160"/>
</p>

<br/>

---

## 🌐 Overview

PixelOffice is a real-time multiplayer **2D virtual office** where users can connect, interact, and collaborate in a shared digital workspace.

Choose your avatar, join rooms, walk around the office, and experience **proximity-based communication** just like real life.

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/a7428c27-f8a1-43ab-99e5-9beca11b5a2b" width="900"/>
</p>

---

## ✨ Features

### 🧍 Avatar-Based Interaction

* Choose your character and enter the virtual office
* Move freely across the map and interact with others

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/e08e05e8-435a-4936-a182-41aea813831c" width="420"/>
  <img src="https://github.com/user-attachments/assets/c49dc6df-5e94-4371-ac2a-08df911280e0" width="420"/>
</p>

---

### 🌍 Public & Private Rooms

* Create or join **public rooms**
* Create **private rooms** for focused collaboration

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/08298bfa-94a4-4997-a90b-dc7c27bdda92" width="400"/>
</p>

---

### 📍 Proximity-Based Voice & Video

* Video/audio connects automatically when users are nearby
* Audio strength changes based on distance
* Moving away gradually disconnects the call

> Real-life simulation of conversations inside a virtual space

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/eb066bf6-a186-4042-a18b-d88b6c607af7" width="420"/>
  <img src="https://github.com/user-attachments/assets/d2197c7b-011c-4e15-abe4-850097327628" width="420"/>
</p>

---

### 🏢 Smart Meeting Rooms

* Entering a meeting room connects everyone instantly
* Communication works regardless of distance inside the room
* Designed for team discussions and collaboration

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/b442083d-cbb5-4ace-8ff9-0001de47e269" width="700"/>
</p>

---

### 💬 Real-Time Chat & Bubbles

* Instant messaging with live chat
* Speech bubbles appear above users

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/f4f81f16-d8ae-424c-9486-34fd47f28682" width="850"/>
</p>

---

### 🖥️ Screen Sharing System

* Use in-game computer zones to share your screen
* Seamless integration with video calls

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/6812583d-1a84-4a3a-8132-0b9418ac196c" width="800"/>
</p>

---

### 🧠 Collaborative Whiteboard

* Shared whiteboard accessible inside meeting rooms
* Can be opened and used by anyone in the room

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/84a985c7-c800-4c3e-aee6-bbb24e6643cc" width="420"/>
  <img src="https://github.com/user-attachments/assets/7fd4adf1-63d7-4b35-88c3-c0ad94ade478" width="420"/>
</p>

---

### 🗺️ Interactive Office Map

* Designed virtual office layout
* Smooth movement and immersive environment

<br/>

<p align="center">
  <img src="https://github.com/user-attachments/assets/4aa56eda-fec9-4afd-9387-8c87e378f3ee" width="650"/>
</p>

---

## 🎮 Controls

| Action                      | Key                           |
| --------------------------- | ----------------------------- |
| Move                        | `W / A / S / D` or Arrow Keys |
| Interact                    | `E`                           |
| Use Computer / Screen Share | `R`                           |
| Open Chat                   | `Enter`                       |
| Close UI                    | `ESC`                         |

---

## ⚙️ Tech Stack

**Frontend**

* Phaser 3
* JavaScript / TypeScript
* Vite

**Backend & Realtime**

* Node.js
* Express
* Colyseus

**WebRTC & Communication**

* PeerJS
* STUN/TURN

**Database**

* Supabase

**Other**

* Whiteboard (WBO)

---

## 🏗️ Architecture

* WebSocket-based multiplayer (Colyseus)
* Peer-to-peer media (WebRTC)
* Modular services (backend, frontend, signaling, whiteboard)

---

## 🚀 Getting Started

```bash
git clone YOUR_REPO_LINK
cd project-folder
npm install
npm run dev
```

---

## 🌍 Deployment Notes

* Deploy frontend & backend separately
* Use HTTPS / WSS in production
* Configure TURN for stability
* Ensure PeerJS is reachable

---

## 🎯 Vision

PixelOffice recreates the **feeling of a real workspace** in a digital world —
where conversations feel natural and collaboration feels alive.

---

## 🙌 Credits

* Inspired by SkyOffice (Kevin Shen)
* Map assets by LimeZu
* Whiteboard by WBO

---
