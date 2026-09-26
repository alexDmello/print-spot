'use client';

import React from 'react';
import CustomerAppView from '@/components/CustomerAppView';

/**
 * Root Customer Landing Page
 * 
 * Default client-side customer entrypoint.
 * Automatically loads recent order sessions, counter QR scanner,
 * or customer counter if ?shop= query parameter is specified.
 */
export default function CustomerPage() {
  return <CustomerAppView />;
}
