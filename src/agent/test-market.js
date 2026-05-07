import { getMarketSnapshot } from './market.js';
import { saveMarketSnapshot, getSnapshotByDate } from '../db/market.js';
import { today } from '../utils/time.js';

const snapshot = await getMarketSnapshot();
console.log('Fetched:', snapshot);

const result = saveMarketSnapshot(snapshot);
console.log('Saved:', result);

const retrieved = getSnapshotByDate(today());
console.log('Retrieved from DB:', retrieved);
