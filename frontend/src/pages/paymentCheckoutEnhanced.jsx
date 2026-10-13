import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from '../api';
import { AlertCircle, Lock, CreditCard, Truck, Gift, ChevronDown, CheckCircle } from 'lucide-react';
import './payment-enhanced.css';

export default function PaymentCheckoutEnhanced() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  const [booking, setBooking] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Payment form fields
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [cardDetails, setCardDetails] = useState({
    number: '',
    holder: '',
    expiry: '',
    cvv: ''
  });
  
  // Coupon management
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  
  // Summary calculation
  const [summary, setSummary] = useState({
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0
  });

  useEffect(() => {
    fetchBookingDetails();
  }, [bookingId]);

  const fetchBookingDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/bookings/${bookingId}`);
      const bookingData = response.data;
      setBooking(bookingData);
      
      // Fetch event details
      const eventResponse = await axios.get(`/events/${bookingData.event_id}`);
      setEvent(eventResponse.data);
      
      // Calculate initial summary
      const subtotal = bookingData.tickets?.length * (eventResponse.data.ticket_price || 0) || bookingData.total_amount;
      const tax = subtotal * 0.1; // 10% tax
      setSummary({
        subtotal: subtotal,
        discount: 0,
        tax: tax,
        total: subtotal + tax
      });
      
      setError('');
    } catch (err) {
      setError('Failed to load booking details. Please try again.');
      console.error('Error fetching booking:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCardChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;
    
    // Format card number with spaces
    if (name === 'number') {
      formattedValue = value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
    }
    // Format expiry as MM/YY
    else if (name === 'expiry') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
      if (formattedValue.length >= 2) {
        formattedValue = formattedValue.slice(0, 2) + '/' + formattedValue.slice(2);
      }
    }
    // Limit CVV to 4 digits
    else if (name === 'cvv') {
      formattedValue = value.replace(/\D/g, '').slice(0, 4);
    }
    
    setCardDetails({
      ...cardDetails,
      [name]: formattedValue
    });
  };

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }
    
    try {
      setValidatingCoupon(true);
      setCouponError('');
      
      const response = await axios.post('/coupons/validate', {
        coupon_code: couponCode,
        booking_amount: summary.subtotal
      });
      
      if (response.data.valid) {
        const discount = response.data.discount_amount;
        setAppliedCoupon(response.data);
        setCouponApplied(true);
        
        // Update summary with discount
        setSummary(prev => ({
          ...prev,
          discount: discount,
          total: prev.subtotal - discount + prev.tax
        }));
      } else {
        setCouponError(response.data.message || 'Invalid coupon code');
      }
    } catch (err) {
      setCouponError(err.response?.data?.detail || 'Failed to validate coupon');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setCouponCode('');
    setCouponApplied(false);
    setAppliedCoupon(null);
    setCouponError('');
    setSummary(prev => ({
      ...prev,
      discount: 0,
      total: prev.subtotal + prev.tax
    }));
  };

  const validatePaymentForm = () => {
    if (paymentMethod === 'CARD') {
      if (!cardDetails.number || cardDetails.number.length < 19) {
        setError('Please enter a valid card number');
        return false;
      }
      if (!cardDetails.holder) {
        setError('Please enter cardholder name');
        return false;
      }
      if (!cardDetails.expiry || cardDetails.expiry.length < 5) {
        setError('Please enter a valid expiry date');
        return false;
      }
      if (!cardDetails.cvv || cardDetails.cvv.length < 3) {
        setError('Please enter a valid CVV');
        return false;
      }
    }
    return true;
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    
    if (!validatePaymentForm()) return;
    
    try {
      setProcessing(true);
      setError('');
      
      const paymentPayload = {
        booking_id: bookingId,
        payment_method: paymentMethod,
        amount: summary.total,
        coupon_id: appliedCoupon?.id || null
      };
      
      if (paymentMethod === 'CARD') {
        paymentPayload.card_details = {
          last_four: cardDetails.number.slice(-4),
          holder_name: cardDetails.holder,
          expiry: cardDetails.expiry
        };
      }
      
      const response = await axios.post('/payments', paymentPayload);
      
      if (response.data.payment_status === 'SUCCESS') {
        setSuccess(true);
        setTimeout(() => {
          navigate('/payment-confirmation', {
            state: { 
              paymentId: response.data.id,
              bookingId: bookingId,
              amount: summary.total
            }
          });
        }, 2000);
      } else if (response.data.payment_status === 'PENDING') {
        navigate('/payment-confirmation', {
          state: { 
            paymentId: response.data.id,
            bookingId: bookingId,
            amount: summary.total
          }
        });
      } else {
        setError(response.data.message || 'Payment failed. Please try again.');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Payment processing failed. Please try again.');
      console.error('Payment error:', err);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="payment-container">
        <div className="payment-skeleton">
          <div className="skeleton-header"></div>
          <div className="skeleton-content"></div>
          <div className="skeleton-content"></div>
          <div className="skeleton-content"></div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="payment-container">
        <div className="payment-error">
          <AlertCircle size={48} />
          <h2>Booking Not Found</h2>
          <p>Unable to load booking details.</p>
          <button onClick={() => navigate('/bookings')} className="btn-back">Back to Bookings</button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-container">
      <div className="payment-wrapper">
        {/* Left Column - Payment Form */}
        <div className="payment-form-section">
          <div className="payment-header">
            <h1>Complete Your Payment</h1>
            <p>Secure checkout for {event?.name}</p>
          </div>

          {error && (
            <div className="payment-alert error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="payment-alert success">
              <CheckCircle size={20} />
              <span>Payment successful! Redirecting...</span>
            </div>
          )}

          <form onSubmit={handlePayment}>
            {/* Order Summary Card */}
            <div className="order-summary-mini">
              <div className="summary-item">
                <span className="summary-label">Event</span>
                <span className="summary-value">{event?.name}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Date</span>
                <span className="summary-value">{new Date(event?.event_date).toLocaleDateString()}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Tickets</span>
                <span className="summary-value">{booking?.quantity} × ${event?.ticket_price}</span>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="form-section">
              <h3 className="form-section-title">Payment Method</h3>
              <div className="payment-method-options">
                <label className={`payment-method-option ${paymentMethod === 'CARD' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    value="CARD"
                    checked={paymentMethod === 'CARD'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <CreditCard size={20} />
                  <span>Credit/Debit Card</span>
                </label>
                <label className={`payment-method-option ${paymentMethod === 'WALLET' ? 'active' : ''}`}>
                  <input
                    type="radio"
                    value="WALLET"
                    checked={paymentMethod === 'WALLET'}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  <Truck size={20} />
                  <span>Digital Wallet</span>
                </label>
              </div>
            </div>

            {/* Card Details */}
            {paymentMethod === 'CARD' && (
              <div className="form-section">
                <h3 className="form-section-title">Card Details</h3>
                <div className="form-group">
                  <label htmlFor="cardNumber">Card Number</label>
                  <input
                    id="cardNumber"
                    type="text"
                    name="number"
                    value={cardDetails.number}
                    onChange={handleCardChange}
                    placeholder="4532 1234 5678 9010"
                    maxLength="23"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="cardHolder">Cardholder Name</label>
                  <input
                    id="cardHolder"
                    type="text"
                    name="holder"
                    value={cardDetails.holder}
                    onChange={handleCardChange}
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="expiry">Expiry Date</label>
                    <input
                      id="expiry"
                      type="text"
                      name="expiry"
                      value={cardDetails.expiry}
                      onChange={handleCardChange}
                      placeholder="MM/YY"
                      maxLength="5"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cvv">CVV</label>
                    <input
                      id="cvv"
                      type="text"
                      name="cvv"
                      value={cardDetails.cvv}
                      onChange={handleCardChange}
                      placeholder="123"
                      maxLength="4"
                      required
                    />
                  </div>
                </div>

                <div className="security-note">
                  <Lock size={14} />
                  <span>Your payment information is encrypted and secure</span>
                </div>
              </div>
            )}

            {/* Coupon Code Section */}
            <div className="form-section">
              <h3 className="form-section-title">
                <Gift size={18} />
                Have a Coupon Code?
              </h3>
              
              {!couponApplied ? (
                <div className="coupon-input-group">
                  <div className="coupon-input-wrapper">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Enter coupon code"
                      disabled={validatingCoupon}
                      className={couponError ? 'error' : ''}
                    />
                    <button
                      type="button"
                      onClick={validateCoupon}
                      disabled={validatingCoupon || !couponCode.trim()}
                      className="btn-apply-coupon"
                    >
                      {validatingCoupon ? 'Validating...' : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <div className="coupon-error">{couponError}</div>
                  )}
                </div>
              ) : (
                <div className="coupon-applied">
                  <div className="coupon-badge">
                    <CheckCircle size={18} />
                    <div className="coupon-info">
                      <p className="coupon-code">{couponCode}</p>
                      <p className="coupon-savings">Save ${summary.discount.toFixed(2)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="btn-remove-coupon"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Terms and Conditions */}
            <div className="terms-checkbox">
              <input type="checkbox" id="terms" required />
              <label htmlFor="terms">
                I agree to the <a href="#terms">terms and conditions</a> and <a href="#privacy">privacy policy</a>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={processing || success}
              className="btn-pay-now"
            >
              {processing ? 'Processing Payment...' : success ? 'Payment Successful!' : `Pay $${summary.total.toFixed(2)}`}
            </button>

            <p className="payment-help">
              Need help? <a href="#support">Contact support</a>
            </p>
          </form>
        </div>

        {/* Right Column - Order Summary */}
        <div className="payment-summary-section">
          <div className="payment-summary-sticky">
            <h2 className="summary-title">Order Summary</h2>

            <div className="summary-details">
              <div className="event-preview">
                {event?.image_url && (
                  <img src={event.image_url} alt={event.name} className="event-image" />
                )}
                <div className="event-preview-info">
                  <h4>{event?.name}</h4>
                  <p className="event-preview-date">
                    {new Date(event?.event_date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              <div className="summary-line-items">
                <div className="line-item">
                  <span className="line-label">Subtotal ({booking?.quantity} tickets)</span>
                  <span className="line-value">${summary.subtotal.toFixed(2)}</span>
                </div>

                <div className="line-item">
                  <span className="line-label">Tax (10%)</span>
                  <span className="line-value">${summary.tax.toFixed(2)}</span>
                </div>

                {summary.discount > 0 && (
                  <div className="line-item discount">
                    <span className="line-label">Discount</span>
                    <span className="line-value">-${summary.discount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total">
                <span className="total-label">Total Amount</span>
                <span className="total-value">${summary.total.toFixed(2)}</span>
              </div>

              {summary.discount > 0 && (
                <div className="discount-banner">
                  <span>💰 You saved ${summary.discount.toFixed(2)} with coupon</span>
                </div>
              )}
            </div>

            {/* Trust Badges */}
            <div className="trust-badges">
              <div className="trust-badge">
                <Lock size={16} />
                <span>Secure Payment</span>
              </div>
              <div className="trust-badge">
                <CheckCircle size={16} />
                <span>100% Secure</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
