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
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
  },
};

export default GameConfig;
