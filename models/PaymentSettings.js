const mongoose = require('mongoose');

const paymentSettingsSchema = new mongoose.Schema({
    upiId: {
        type: String,
        required: true,
        default: 'aashutoahjain0@ybl'
    },
    phoneNumber: {
        type: String,
        required: true,
        default: '9752836655'
    },
    qrCodeUrl: {
        type: String,
        required: true,
        default: 'https://via.placeholder.com/150'
    },
    telegramLink: {
        type: String,
        required: false,
        default: 'https://t.me/Gopal2580'
    }
}, { timestamps: true });

// Make sure we only have one document in this collection
paymentSettingsSchema.statics.getSingletonInstance = async function () {
    const settings = await this.findOne();
    if (settings) {
        return settings;
    }
    return this.create({});
};

module.exports = mongoose.model('PaymentSettings', paymentSettingsSchema); 