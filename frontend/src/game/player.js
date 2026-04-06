import Phaser from 'phaser';

/**
 * Player Controller
 * Manages player creation, movement, and camera following
 */

export default class Player {
  constructor(scene, x, y) {
    this.scene = scene;

    this.characterKey = 'adam';
    this.currentDirection = 'down';

    this.sprite = scene.physics.add.sprite(x, y, this.characterKey);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(1000);
    this.sprite.anims.play(`${this.characterKey}_idle_down`);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.body.setBounce(0);
    // Narrow hitbox for top-down movement so feet align with map tiles.
    this.sprite.body.setSize(16, 20);
    this.sprite.body.setOffset(
      (this.sprite.width - 16) / 2,
      this.sprite.height - 20,
    );
    
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
      this.currentDirection = 'left';
      this.sprite.anims.play(`${this.characterKey}_run_left`, true);
    }
    if (this.keys.right.isDown || this.keys.d.isDown) {
      this.velocityX = this.speed;
      this.currentDirection = 'right';
      this.sprite.anims.play(`${this.characterKey}_run_right`, true);
    }
    if (this.keys.up.isDown || this.keys.w.isDown) {
      this.velocityY = -this.speed;
      this.currentDirection = 'up';
      this.sprite.anims.play(`${this.characterKey}_run_up`, true);
    }
    if (this.keys.down.isDown || this.keys.s.isDown) {
      this.velocityY = this.speed;
      this.currentDirection = 'down';
      this.sprite.anims.play(`${this.characterKey}_run_down`, true);
    }

    if (this.velocityX === 0 && this.velocityY === 0) {
      this.sprite.anims.play(
        `${this.characterKey}_idle_${this.currentDirection}`,
        true,
      );
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
    const nextX = Number(x);
    const nextY = Number(y);

    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }

    const mapWidth = this.scene.tilemap?.widthInPixels;
    const mapHeight = this.scene.tilemap?.heightInPixels;

    if (Number.isFinite(mapWidth) && Number.isFinite(mapHeight)) {
      this.sprite.setPosition(
        Phaser.Math.Clamp(nextX, 0, mapWidth),
        Phaser.Math.Clamp(nextY, 0, mapHeight),
      );
      return;
    }

    this.sprite.setPosition(nextX, nextY);
  }
  
  destroy() {
    this.sprite.destroy();
  }
}
