import React from 'react';
import { Redirect } from 'expo-router';
import { DRIVER_REQUESTS_ROUTE } from '@/services/requestSections';

export default function LegacyDriverRequests() {
  return <Redirect href={DRIVER_REQUESTS_ROUTE} />;
}