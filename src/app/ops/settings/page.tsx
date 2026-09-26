import type { Metadata } from 'next';
import SettingsConsole from './SettingsConsole';

export const metadata: Metadata = { title: 'Platform settings' };

export default function OpsSettingsPage() {
  return <SettingsConsole />;
}
