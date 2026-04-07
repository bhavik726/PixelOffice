import Phaser from 'phaser';
import MainScene from './scenes/MainScene';

/**
 * Phaser 3 Game Configuration
 * Configures the game instance with physics, rendering, and scene settings
 */
const GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a1a',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
      // Enable debug rendering for collision bounds
      // debug: true,
    },
  },
  
  scene: [MainScene],
  
  // Scale to fit window
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    expandParent: true,
  },
};

export default GameConfig;
