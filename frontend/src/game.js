import Phaser from "phaser";
import { Client } from "colyseus.js";

const COLYSEUS_SERVER = "ws://127.0.0.1:4000";
const ROOM_ID = "_nkzqL5iN";

export function createGame() {
  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: "#1a1a1a",
    scene: {
      preload,
      create,
      update,
    },
  };

  new Phaser.Game(config);
}

let player;
let room;
let cursors;

async function preload() {}

async function create() {
  player = this.add.rectangle(400, 300, 40, 40, 0x00ff00);
  cursors = this.input.keyboard.createCursorKeys();

  // Connect to Colyseus
  try {
    const client = new Client(COLYSEUS_SERVER);
    room = await client.joinById(ROOM_ID);
    console.log("✓ Connected to Colyseus room:", ROOM_ID);

    // Listen to state changes
    if (room.state) {
      room.onStateChange(() => {
        console.log("State updated", {
          playerCount: room.state?.players?.size || 0,
        });
      });

      // Listen to player map changes
      if (room.state.players) {
        room.state.players.onAdd?.((player, sessionId) => {
          console.log("Player joined:", sessionId, { x: player.x, y: player.y });
        });

        room.state.players.onChange?.((player, sessionId) => {
          console.log("Player moved:", sessionId, { x: player.x, y: player.y });
        });

        room.state.players.onRemove?.((player, sessionId) => {
          console.log("Player left:", sessionId);
        });
      }
    }
  } catch (error) {
    console.error("Failed to connect to Colyseus:", error);
  }
}

function update() {
  const isMoving =
    cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown;

  // Local movement for immediate feedback
  if (cursors.left.isDown) player.x -= 3;
  if (cursors.right.isDown) player.x += 3;
  if (cursors.up.isDown) player.y -= 3;
  if (cursors.down.isDown) player.y += 3;

  // Send movement to backend with absolute coordinates
  if (isMoving && room) {
    room.send("move", { x: Math.round(player.x), y: Math.round(player.y) });
  }
}