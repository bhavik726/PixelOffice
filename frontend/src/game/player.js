import Phaser from 'phaser';

/**
 * Player Controller
 * Manages player creation, movement, and camera following
 */

export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    
    // Create a small physics rectangle as the player sprite
    this.sprite = scene.add.rectangle(x, y, 20, 20, 0xff7f00);
    scene.physics.add.existing(this.sprite);
    this.sprite.setFillStyle(0xff7f00, 1);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.body.setBounce(0);
    
    // Store references for easy access
    this.sprite.isPlayer = true;
    
    // Velocity for smooth movement
    this.velocityX = 0;
    this.velocityY = 0;
    this.speed = 120;
    
    // Setup camera follow
    scene.cameras.main.startFollow(this.sprite, true);
    scene.cameras.main.setBounds(0, 0, scene.tilemap.widthInPixels, scene.tilemap.heightInPixels);
    
    // Setup input keys for movement
    this.setupInput();
  }
  
  setupInput() {
    this.keys = this.scene.input.keyboard.createCursorKeys();
    this.keys.w = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keys.a = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.s = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keys.d = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }
  
  update() {
    // Reset velocity
    this.velocityX = 0;
    this.velocityY = 0;
    
    // Handle arrow keys and WASD
    if (this.keys.left.isDown || this.keys.a.isDown) {
      this.velocityX = -this.speed;
    }
    if (this.keys.right.isDown || this.keys.d.isDown) {
      this.velocityX = this.speed;
    }
    if (this.keys.up.isDown || this.keys.w.isDown) {
      this.velocityY = -this.speed;
    }
    if (this.keys.down.isDown || this.keys.s.isDown) {
      this.velocityY = this.speed;
    }
    
    // Apply velocity to sprite
    this.sprite.body.setVelocity(this.velocityX, this.velocityY);
  }
  
  getPosition() {
    return {
      x: this.sprite.x,
      y: this.sprite.y,
    };
  }
  
  setPosition(x, y) {
    this.sprite.setPosition(x, y);
  }
  
  destroy() {
    this.sprite.destroy();
  }
}
