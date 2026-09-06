import { env } from 'cloudflare:workers';
import {
  cloudVoiceTranscribe,
  type VoiceEnvironment,
} from '@/lib/server/cloud-voice';

export async function POST(request: Request) {
  return cloudVoiceTranscribe(request, env as VoiceEnvironment);
}
