import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from '../api';
import { CheckCircle, AlertCircle, Download, Share2, Home, Printer, Copy } from 'lucide-react';
import './payment-enhanced.css';

export default function PaymentConfirmationEnhanced() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state || {};
  
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    fetchPaymentAndBookingDetails();
  }, [state.paymentId, state.bookingId]);

  const fetchPaymentAndBookingDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch payment details
      if (state.paymentId) {
        const paymentResponse = await axios.get(`/payments/${state.paymentId}`);
        setPaymentDetails(paymentResponse.data);
      }
      
      // Fetch booking details
      if (state.bookingId) {
        const bookingResponse = await axios.get(`/bookings/${state.bookingId}`);
        setBookingDetails(bookingResponse.data);
      }
      
      setError('');
    } catch (err) {
      setError('Failed to load payment details');
      console.error('Error fetching details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Generate PDF or download receipt
    const receiptContent = `
      PAYMENT CONFIRMATION RECEIPT
      
      Payment ID: ${paymentDetails?.transaction_id}
      Booking ID: ${bookingDetails?.id}
      
      Amount: $${state.amount?.toFixed(2)}
      Status: ${paymentDetails?.payment_status}
      Date: ${new Date(paymentDetails?.created_at).toLocaleDateString()}
      
      Thank you for your payment!
    `;
    
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(receiptContent));
    element.setAttribute('download', `receipt-${paymentDetails?.transaction_id}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleCopyTransactionId = () => {
    navigator.clipboard.writeText(paymentDetails?.transaction_id);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleShare = () => {
    const text = `I just completed my payment for an event ticket! Transaction ID: ${paymentDetails?.transaction_id}`;
    if (navigator.share) {
      navigator.share({
        title: 'Payment Confirmation',
        text: text
      });
    } else {
      alert('Share functionality not supported on this device');
    }
  };

  if (loading) {
    return (
      <div className="confirmation-container">
        <div className="confirmation-loader">
          <div className="loader-spinner"></div>
          <p>Loading your confirmation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="confirmation-container">
        <div className="confirmation-error">
          <AlertCircle size={48} />
          <h2>Error Loading Confirmation</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/bookings')} className="btn-back-home">
            Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  const isSuccessful = paymentDetails?.payment_status === 'SUCCESS';

  return (
    <div className="confirmation-container">
      <div className="confirmation-wrapper">
        {/* Header */}
        <div className="confirmation-header">
          <div className={`confirmation-icon ${isSuccessful ? 'success' : 'pending'}`}>
            {isSuccessful ? (
              <CheckCircle size={80} strokeWidth={1.5} />
            ) : (
              <AlertCircle size={80} strokeWidth={1.5} />
            )}
          </div>
          
          <h1 className="confirmation-title">
            {isSuccessful ? 'Payment Successful!' : 'Payment Processing'}
          </h1>
          
          <p className="confirmation-subtitle">
            {isSuccessful 
              ? 'Your payment has been completed successfully'
              : 'Your payment is being processed. You will receive an email confirmation shortly'
            }
          </p>
        </div>

        {/* Main Content */}
        <div className="confirmation-content">
          {/* Transaction Details Card */}
          <div className="details-card transaction-card">
            <h2 className="card-title">Transaction Details</h2>
            
            <div className="details-grid">
              <div className="detail-item">
                <span className="detail-label">Transaction ID</span>
                <div className="detail-value-with-action">
                  <span className="detail-value" id="transactionId">
                    {paymentDetails?.transaction_id}
                  </span>
                  <button 
                    onClick={handleCopyTransactionId}
                    className="btn-copy"
                    title="Copy Transaction ID"
                  >
                    <Copy size={16} />
                  </button>
                </div>
                {copySuccess && <span className="copy-success">Copied!</span>}
              </div>

              <div className="detail-item">
                <span className="detail-label">Payment Status</span>
                <span className={`detail-value status-${paymentDetails?.payment_status?.toLowerCase()}`}>
                  {paymentDetails?.payment_status}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Payment Method</span>
                <span className="detail-value">
                  {paymentDetails?.payment_method === 'CARD' ? 'Credit/Debit Card' : 'Digital Wallet'}
                </span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Date & Time</span>
                <span className="detail-value">
                  {new Date(paymentDetails?.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Summary Card */}
          <div className="details-card summary-card">
            <h2 className="card-title">Payment Summary</h2>
            
            <div className="summary-breakdown">
              <div className="summary-row">
                <span className="summary-label">Subtotal</span>
                <span className="summary-amount">${(state.amount * 0.909).toFixed(2)}</span>
              </div>
              
              <div className="summary-row">
                <span className="summary-label">Tax (10%)</span>
                <span className="summary-amount">${(state.amount * 0.1).toFixed(2)}</span>
              </div>
              
              {bookingDetails?.discount_amount > 0 && (
                <div className="summary-row discount">
                  <span className="summary-label">Discount Applied</span>
                  <span className="summary-amount">-${bookingDetails.discount_amount.toFixed(2)}</span>
                </div>
              )}
              
              <div className="summary-divider"></div>
              
              <div className="summary-row total">
                <span className="summary-label">Total Paid</span>
                <span className="summary-amount">${state.amount?.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Booking Details Card */}
          {bookingDetails && (
            <div className="details-card booking-card">
              <h2 className="card-title">Booking Details</h2>
              
              <div className="details-grid">
                <div className="detail-item">
                  <span className="detail-label">Booking ID</span>
                  <span className="detail-value">{bookingDetails.id}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Number of Tickets</span>
                  <span className="detail-value">{bookingDetails.quantity}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Booking Status</span>
                  <span className={`detail-value status-${bookingDetails.booking_status?.toLowerCase()}`}>
                    {bookingDetails.booking_status}
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">Booked On</span>
                  <span className="detail-value">
                    {new Date(bookingDetails.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="tickets-preview">
                <h3 className="tickets-title">Your Tickets</h3>
                <div className="tickets-list">
                  {Array.from({ length: bookingDetails.quantity }).map((_, idx) => (
                    <div key={idx} className="ticket-item">
                      <span className="ticket-number">Ticket #{idx + 1}</span>
                      <span className="ticket-status">✓ Confirmed</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Next Steps Card */}
          <div className="details-card next-steps-card">
            <h2 className="card-title">What's Next?</h2>
            
            <ol className="steps-list">
              <li className="step-item">
                <span className="step-number">1</span>
                <div className="step-content">
                  <h4>Check Your Email</h4>
                  <p>A confirmation email with your tickets has been sent to your registered email address</p>
                </div>
              </li>
              
              <li className="step-item">
                <span className="step-number">2</span>
                <div className="step-content">
                  <h4>Download Your Tickets</h4>
                  <p>You can download or view your tickets from your account dashboard anytime</p>
                </div>
              </li>
              
              <li className="step-item">
                <span className="step-number">3</span>
                <div className="step-content">
                  <h4>Arrive Early on Event Day</h4>
                  <p>Show your tickets at the venue entrance. No printing required!</p>
                </div>
              </li>
              
              <li className="step-item">
                <span className="step-number">4</span>
                <div className="step-content">
                  <h4>Enjoy the Event</h4>
                  <p>Have a great time! Don't forget to rate and review the event after attending</p>
                </div>
              </li>
            </ol>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="confirmation-actions">
          <button onClick={handlePrint} className="btn-action btn-print">
            <Printer size={18} />
            Print Receipt
          </button>
          
          <button onClick={handleDownload} className="btn-action btn-download">
            <Download size={18} />
            Download Receipt
          </button>
          
          <button onClick={handleShare} className="btn-action btn-share">
            <Share2 size={18} />
            Share
          </button>
        </div>

        {/* CTA Buttons */}
        <div className="confirmation-cta">
          <button 
            onClick={() => navigate('/tickets')} 
            className="btn-view-tickets"
          >
            View My Tickets
          </button>
          
          <button 
            onClick={() => navigate('/')} 
            className="btn-continue-shopping"
          >
            <Home size={18} />
            Back to Home
          </button>
        </div>

        {/* Need Help Section */}
        <div className="need-help-section">
          <div className="need-help-content">
            <h3>Need Help?</h3>
            <p>If you didn't receive your confirmation email or have any questions about your booking:</p>
            <div className="help-links">
              <a href="#faq" className="help-link">View FAQ</a>
              <a href="#support" className="help-link">Contact Support</a>
              <a href="#status" className="help-link">Check Payment Status</a>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .confirmation-actions,
          .confirmation-cta,
          .need-help-section {
            display: none;
          }
          
          .confirmation-wrapper {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
