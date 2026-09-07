import { env } from 'cloudflare:workers';
import {
  cloudPhotoRecognize,
  type PhotoEnvironment,
} from '@/lib/server/cloud-photo';
export async function POST(request: Request) {
  return cloudPhotoRecognize(request, env as PhotoEnvironment);
}
