import { apiClient } from '../api-client';

export const PaymentService = {
    async createStripeSession(packageId: string) {
        return await apiClient.post('/payments/stripe/create-session', { package_id: packageId });
    },
    
    async verifyPayment(transactionId: string) {
        return await apiClient.get(`/payments/verify?txid=${transactionId}`);
    },

    async getTransactionHistory() {
        return await apiClient.get('/user/transactions');
    }
};
