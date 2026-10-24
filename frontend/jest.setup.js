/* eslint-disable */
require('@testing-library/jest-dom')

var tMap = {
  brand: 'English AI Coach',
  demoVersion: 'Demo Version',
  englishLevel: 'English Level',
  allCorrections: 'All Corrections',
  switchToLight: 'Switch to light mode',
  switchToDark: 'Switch to dark mode',
  levelA1: 'Beginner',
  levelA2: 'Elementary',
  levelB1: 'Intermediate',
  levelB2: 'Upper-Int.',
  levelC1: 'Advanced',
  levelC2: 'Proficient',
  demoLastMessage: 'This is your last message',
  demoLimitReached: 'demo limit reached',
  messageCount: '{count} / {limit} messages used',
  selectCefr: 'Select CEFR level',
  startConversation: 'Start a conversation',
  emptyHint: 'Type a message or hold the mic.',
  typeMessage: 'Type a message...',
  demoLimitMessage: 'Demo limit reached.',
  demoLimitReachedInput: 'Demo limit reached.',
  sendMessage: 'Send message',
  sendEnter: 'Send (Enter)',
  holdToRecord: 'Hold to record audio',
  recordingRelease: 'Recording...',
  dismiss: 'Dismiss',
  resetConversation: 'Reset conversation',
  resetConfirm: 'Reset?',
  correctionsForLast: 'Corrections for last message',
  shown: '{count} shown',
  noCorrections: 'No corrections.',
  markReviewed: 'Mark reviewed',
  reviewed: 'Reviewed',
  correctionQueue: 'Correction Queue',
  noCorrectionsQueue: 'No corrections yet.',
  recentCorrections: 'Recent Corrections',
  correctionOriginal: 'Original',
  correctionCorrected: 'Corrected',
  correctionExplanation: 'Explanation',
  correctionLevel: 'Level',
  correctionCategory: 'Category',
  reviewSuccess: 'Marked reviewed',
  audioTranscribing: '(transcribing...)',
  chatError: 'Failed to load errors.',
  microphoneNotAvailable: 'Mic not available.',
  microphoneNotSupported: 'MediaRecorder not supported.',
  microphonePermissionDenied: 'Mic permission denied.',
  microphoneUnavailable: 'Mic unavailable.',
  failedToReset: 'Failed to reset.',
  settings: 'Settings',
  provider: 'Provider',
  model: 'Model',
  save: 'Save',
  cancel: 'Cancel',
  language: 'Language',
  close: 'Close',
}

jest.mock('next-intl', function() {
  return {
    useTranslations: function() {
      return function(key) { return tMap[key] || key }
    },
    useLocale: function() { return 'en' },
    NextIntlClientProvider: function(_a) { return _a.children },
  }
})

jest.mock('next/navigation', function() {
  return {
    useRouter: function() {
      return { push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), back: jest.fn() }
    },
    usePathname: function() { return '/' },
    useSearchParams: function() { return new URLSearchParams() },
    Link: function(_a) { return _a.children },
  }
})
