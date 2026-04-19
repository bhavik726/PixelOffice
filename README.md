<p align="center">
  <!-- 🔥 ADD YOUR LOGO HERE -->
  <img src="frontend/public/logo.png" width="80"/>
</p>

# PixelOffice 🏢✨
*A Real-Time 2D Virtual Office Experience*

---

## 🌐 Live Experience

<p align="center">
  <a href="https://pixelofficefrontend.vercel.app/" target="_blank">
    <b>🚀 Enter PixelOffice</b>
  </a>
</p>

## 🌐 Overview

PixelOffice is a real-time multiplayer **2D virtual office** where users can connect, interact, and collaborate in a shared digital workspace.

Choose your avatar, join rooms, walk around the office, and experience **proximity-based communication** just like real life.

<p align="center">
  <img width="1919" height="871" alt="home page" src="https://github.com/user-attachments/assets/a7428c27-f8a1-43ab-99e5-9beca11b5a2b" />
</p>

---

## ✨ Features

### 🧍 Avatar-Based Interaction

* Choose your character and enter the virtual office
* Move freely across the map and interact with others

<p align="center">
  <img width="1101" height="573" alt="character select" src="https://github.com/user-attachments/assets/e08e05e8-435a-4936-a182-41aea813831c" />
</p>

<p align="center">
  <img width="1914" height="868" alt="character" src="https://github.com/user-attachments/assets/c49dc6df-5e94-4371-ac2a-08df911280e0" />
</p>

---

### 🌍 Public & Private Rooms

* Create or join **public rooms**
* Create **private rooms** for focused collaboration

<p align="center">
  <img width="467" height="796" alt="rooms" src="https://github.com/user-attachments/assets/08298bfa-94a4-4997-a90b-dc7c27bdda92" />
</p>

---

### 📍 Proximity-Based Voice & Video

* Video/audio connects automatically when users are nearby
* Audio strength changes based on distance
* Moving away gradually disconnects the call
> Real-life simulation of conversations inside a virtual space

<p align="center">
  <img width="1911" height="870" alt="distance" src="https://github.com/user-attachments/assets/eb066bf6-a186-4042-a18b-d88b6c607af7" />
</p>

<p align="center">
  <img width="1905" height="875" alt="proximity connect" src="https://github.com/user-attachments/assets/d2197c7b-011c-4e15-abe4-850097327628" />
</p>

---

### 🏢 Smart Meeting Rooms

* Entering a meeting room connects everyone instantly
* Communication works regardless of distance inside the room
* Designed for team discussions and collaboration

<p align="center">
  <img width="944" height="517" alt="smart meeting rooms" src="https://github.com/user-attachments/assets/b442083d-cbb5-4ace-8ff9-0001de47e269" />
</p>

---

### 💬 Real-Time Chat & Bubbles

* Instant messaging with live chat
* Speech bubbles appear above users

<img width="1919" height="940" alt="chat bubble" src="https://github.com/user-attachments/assets/a3a8b415-11b2-4140-9395-86fbcb2fe26f" />

---

### 🖥️ Screen Sharing System

* Use in-game computer zones to share your screen
* Seamless integration with video calls

<p align="center">
  <img width="1600" height="731" alt="screen share" src="https://github.com/user-attachments/assets/6812583d-1a84-4a3a-8132-0b9418ac196c" />
</p>

---

### 🧠 Collaborative Whiteboard

* Shared whiteboard accessible inside meeting rooms
* Can be opened and used by anyone in the room

<p align="center">
  <img width="949" height="504" alt="whiteboard" src="https://github.com/user-attachments/assets/84a985c7-c800-4c3e-aee6-bbb24e6643cc" />
</p>

<p align="center">
  <img width="1911" height="872" alt="board" src="https://github.com/user-attachments/assets/7fd4adf1-63d7-4b35-88c3-c0ad94ade478" />
</p>

---

### 🗺️ Interactive Office Map

* Designed virtual office layout
* Smooth movement and immersive environment

<p align="center">
  <img width="913" height="679" alt="map" src="https://github.com/user-attachments/assets/4aa56eda-fec9-4afd-9387-8c87e378f3ee" />
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

* PeerJS (for signaling)
* STUN/TURN (for connectivity)

**Database**

* Supabase (PostgreSQL)

**Other Integrations**

* Whiteboard (WBO)

---

## 🏗️ Architecture

* Real-time multiplayer powered by WebSockets (Colyseus)
* Peer-to-peer media via WebRTC
* Separate services for backend, frontend, signaling, and whiteboard

---

## 🚀 Getting Started

```bash
# Clone the repository
git clone YOUR_REPO_LINK

# Install dependencies
cd project-folder
npm install

# Run backend
npm run dev

# Run frontend
npm run dev
```

---

## 🌍 Deployment Notes

* Deploy frontend and backend separately
* Use HTTPS & WSS in production
* Configure STUN/TURN for stable WebRTC connections
* Ensure PeerJS server is publicly accessible

---

## 🎯 Vision

PixelOffice aims to recreate the **feeling of a real workspace** in a digital environment —
where conversations feel natural, collaboration is seamless, and presence actually matters.

---

## 🙌 Credits

* Inspired by the concept and innovation behind
  [SkyOffice by Kevin Shen](https://github.com/kevinshen56714/SkyOffice)

* Map assets by
  [LimeZu](https://limezu.itch.io/)

* Whiteboard powered by
  [WBO (Whiteboard Open Source)](https://github.com/lovasoa/whitebophir)

---
