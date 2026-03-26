import { Redirect } from 'expo-router';
import React from 'react';

export default function CreateListingRedirect() {
  return <Redirect href="/(tabs)/add" />;
}
