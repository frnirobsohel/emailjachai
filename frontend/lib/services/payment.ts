import { apiClient } from '@/lib/api-client';

export const PaymentService = {
    async createStripeSession(packageId: string) {
        return await apiClient.post('/payment/stripe/create', { package_id: packageId });
    },

    async verifyPayment(transactionId: string) {
        return await apiClient.get(`/payments/verify?txid=${transactionId}`);
    },

    async cancelPayment(transactionId: string) {
        return await apiClient.post('/payment/cancel', { transaction_id: transactionId });
    },

    async getTransactionHistory() {
        return await apiClient.get('/user/transactions');
    }
};
