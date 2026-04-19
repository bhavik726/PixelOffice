# PixelOffice 🏢✨

*A Real-Time 2D Virtual Office Experience*

<p align="center">
  <!-- 🔥 ADD YOUR LOGO HERE -->
  <img src="YOUR_LOGO_LINK" width="180"/>
</p>

---

## 🌐 Overview

PixelOffice is a real-time multiplayer **2D virtual office** where users can connect, interact, and collaborate in a shared digital workspace.

Choose your avatar, join rooms, walk around the office, and experience **proximity-based communication** just like real life.

---

## ✨ Features

### 🧍 Avatar-Based Interaction

* Choose your character and enter the virtual office
* Move freely across the map and interact with others

<!-- 📸 ADD: Home / Avatar Selection Screenshot -->

---

### 🌍 Public & Private Rooms

* Create or join **public rooms**
* Create **private rooms** for focused collaboration

<!-- 📸 ADD: Room Selection Screenshot -->

---

### 📍 Proximity-Based Voice & Video

* Video/audio connects automatically when users are nearby
* Audio strength changes based on distance
* Moving away gradually disconnects the call

> Real-life simulation of conversations inside a virtual space

<!-- 📸 ADD: Proximity Chat Screenshot -->

---

### 🏢 Smart Meeting Rooms

* Entering a meeting room connects everyone instantly
* Communication works regardless of distance inside the room
* Designed for team discussions and collaboration

<!-- 📸 ADD: Meeting Room Screenshot -->

---

### 💬 Real-Time Chat & Bubbles

* Instant messaging with live chat
* Speech bubbles appear above users

<!-- 📸 ADD: Chat + Bubble Screenshot -->

---

### 🖥️ Screen Sharing System

* Use in-game computer zones to share your screen
* Seamless integration with video calls

<!-- 📸 ADD: Screen Share Screenshot -->

---

### 🧠 Collaborative Whiteboard

* Shared whiteboard accessible inside meeting rooms
* Can be opened and used by anyone in the room

<!-- 📸 ADD: Whiteboard Screenshot -->

---

### 🗺️ Interactive Office Map

* Designed virtual office layout
* Smooth movement and immersive environment

<!-- 📸 ADD: Map Screenshot -->

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


