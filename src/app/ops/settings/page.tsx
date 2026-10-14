import type { Metadata } from 'next';
import SettingsConsole from './SettingsConsole';
import { requireCapability } from '../gate';

export const metadata: Metadata = { title: 'Platform settings' };

export default async function OpsSettingsPage() {
  await requireCapability('settings.read');
  return <SettingsConsole />;
}
