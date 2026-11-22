import type {
  AccountCharge, Application, Campaign, Client, ClientSubscription, CommercialTask,
  Contact, Conversation, PaymentRecord,
} from './types.js';

export interface PcCommercialRecords {
  applications: Application[];
  campaigns: Campaign[];
  clients: Client[];
  subscriptions: ClientSubscription[];
  contacts: Contact[];
  conversations: Conversation[];
  accountCharges: AccountCharge[];
  payments: PaymentRecord[];
  tasks: CommercialTask[];
}

export interface PcRecordsStatus {
  online: boolean;
  records?: PcCommercialRecords;
  receivedAt?: number;
}
