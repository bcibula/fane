import { sendBriefingEmail } from './email.js';
import { today } from '../utils/time.js';

const testBriefing = `This is a test briefing from Fane.

Default recommendation: No action.

If you received this, email delivery is working correctly.`;

const result = await sendBriefingEmail(today(), testBriefing);
console.log('Email sent:', result.messageId);
