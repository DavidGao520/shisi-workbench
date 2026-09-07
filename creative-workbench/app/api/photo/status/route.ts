import { env } from 'cloudflare:workers';
import {
  cloudPhotoStatus,
  type PhotoEnvironment,
} from '@/lib/server/cloud-photo';
export async function GET() {
  return cloudPhotoStatus(env as PhotoEnvironment);
}
