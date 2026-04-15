import Phaser from 'phaser';

/**
 * Player Controller
 * Manages player creation, movement, and camera following
 */

export default class Player {
  constructor(scene, x, y, characterKey = 'adam') {
    this.scene = scene;

    this.characterKey = characterKey;
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
    this.speed = 200;
    this.isSitting = false;
    this.isMovementLocked = false;
    this.isMoving = false;
    this.lastMoveAxis = 'vertical';
    
    // Setup camera follow with a tight lock so POV moves directly with the character.
    this.cameraLerp = 1;
    this.cameraZoomDesktop = 2.1;
    this.cameraZoomMobile = 1.7;
    this.configureCamera();

    this.boundResizeHandler = () => {
      this.applyCameraZoom();
    };
    this.scene.scale.on('resize', this.boundResizeHandler);
    
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
    if (this.isMovementLocked || this.scene.chatInputActive || this.scene.whiteboardActive) {
      this.sprite.body.setVelocity(0, 0);
      this.isMoving = false;
      return;
    }

    // Resolve key states first so we can control movement and animation priority explicitly.
    const leftDown = this.keys.left.isDown || this.keys.a.isDown;
    const rightDown = this.keys.right.isDown || this.keys.d.isDown;
    const upDown = this.keys.up.isDown || this.keys.w.isDown;
    const downDown = this.keys.down.isDown || this.keys.s.isDown;

    const inputX = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
    const inputY = (downDown ? 1 : 0) - (upDown ? 1 : 0);

    if (inputX === 0 && inputY === 0) {
      this.velocityX = 0;
      this.velocityY = 0;
    } else {
      const magnitude = Math.hypot(inputX, inputY);
      this.velocityX = (inputX / magnitude) * this.speed;
      this.velocityY = (inputY / magnitude) * this.speed;
    }

    if (this.velocityX === 0 && this.velocityY === 0) {
      this.sprite.anims.play(
        `${this.characterKey}_idle_${this.currentDirection}`,
        true,
      );
      this.isMoving = false;
    } else {
      if (inputX !== 0 && inputY !== 0) {
        // Keep diagonal animation stable by honoring the last dominant axis.
        if (this.lastMoveAxis === 'horizontal') {
          this.currentDirection = inputX < 0 ? 'left' : 'right';
        } else {
          this.currentDirection = inputY < 0 ? 'up' : 'down';
        }
      } else if (inputX < 0) {
        this.currentDirection = 'left';
        this.lastMoveAxis = 'horizontal';
      } else if (inputX > 0) {
        this.currentDirection = 'right';
        this.lastMoveAxis = 'horizontal';
      } else if (inputY < 0) {
        this.currentDirection = 'up';
        this.lastMoveAxis = 'vertical';
      } else if (inputY > 0) {
        this.currentDirection = 'down';
        this.lastMoveAxis = 'vertical';
      }

      this.sprite.anims.play(`${this.characterKey}_run_${this.currentDirection}`, true);
      this.isMoving = true;
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

  getSyncState() {
    return {
      x: this.sprite.x,
      y: this.sprite.y,
      direction: this.currentDirection,
      isMoving: this.isMoving,
      isSitting: this.isSitting,
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

  setSitting(direction) {
    this.isSitting = true;
    this.isMovementLocked = true;
    this.isMoving = false;
    this.currentDirection = direction;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.anims.play(`${this.characterKey}_sit_${direction}`, true);
  }

  setMovementLocked(locked) {
    this.isMovementLocked = Boolean(locked);

    if (this.isMovementLocked) {
      this.sprite.body.setVelocity(0, 0);
      this.isMoving = false;
    }
  }

  setStanding(direction = this.currentDirection) {
    this.isSitting = false;
    this.isMovementLocked = false;
    this.isMoving = false;
    this.currentDirection = direction;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.anims.play(`${this.characterKey}_idle_${direction}`, true);
  }

  setCharacterKey(characterKey) {
    if (typeof characterKey !== 'string' || characterKey.length === 0) {
      return;
    }

    if (this.characterKey === characterKey) {
      return;
    }

    this.characterKey = characterKey;
    this.sprite.setTexture(characterKey);

    const activeAnim = this.isSitting
      ? `${this.characterKey}_sit_${this.currentDirection}`
      : `${this.characterKey}_idle_${this.currentDirection}`;
    this.sprite.anims.play(activeAnim, true);
  }

  configureCamera() {
    const camera = this.scene.cameras.main;
    camera.setBounds(0, 0, this.scene.tilemap.widthInPixels, this.scene.tilemap.heightInPixels);
    // Avoid diagonal jitter from pixel rounding with non-integer camera movement.
    camera.setRoundPixels(false);
    camera.startFollow(this.sprite, true, this.cameraLerp, this.cameraLerp);
    this.applyCameraZoom();
  }

  applyCameraZoom() {
    const camera = this.scene.cameras.main;
    const screenWidth = Number(window.innerWidth || this.scene.scale.width || 0);
    const zoom = screenWidth <= 768 ? this.cameraZoomMobile : this.cameraZoomDesktop;
    camera.setZoom(zoom);
  }
  
  destroy() {
    if (this.boundResizeHandler) {
      this.scene.scale.off('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }

    this.sprite.destroy();
  }
}
