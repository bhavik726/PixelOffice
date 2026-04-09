export interface Room {
  id: string;
  name: string;
  description: string;
  type: 'public' | 'private';
  password?: string;
  created_by: string | null;
  colyseus_room_id?: string | null;
}
