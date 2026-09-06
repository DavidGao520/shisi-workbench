import { env } from 'cloudflare:workers';
import {
  cloudVoiceStatus,
  type VoiceEnvironment,
} from '@/lib/server/cloud-voice';

export async function GET() {
  return cloudVoiceStatus(env as VoiceEnvironment);
}
