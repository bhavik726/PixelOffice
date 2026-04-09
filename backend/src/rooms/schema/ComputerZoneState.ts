import { Schema, MapSchema, type } from '@colyseus/schema';

export class ComputerZonePlayer extends Schema {
  @type('string')
  sessionId = '';

  @type('string')
  peerId = '';

  @type('boolean')
  isSharing = false;

  @type('boolean')
  videoEnabled = false;

  @type('boolean')
  audioEnabled = false;
}

export class ComputerZoneState extends Schema {
  @type({ map: ComputerZonePlayer })
  players = new MapSchema<ComputerZonePlayer>();
}
