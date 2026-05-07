const Trip = require('../models/Trip');
const { calculateCarbon, calculateEVEnergy } = require('../services/carbonService');

exports.createTrip = async (req, res) => {
  try {
    const trip = await Trip.create(req.body);
    res.status(201).json(trip);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getTrips = async (req, res) => {
  try {
    const trips = await Trip.find({ userId: req.query.userId }).sort({ createdAt: -1 });
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTrip = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTrip = async (req, res) => {
  try {
    const trip = await Trip.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json(trip);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteTrip = async (req, res) => {
  try {
    const trip = await Trip.findByIdAndDelete(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    res.json({ message: 'Trip deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.calculateTripCarbon = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { distance, mode } = req.body;

    if (!distance || !mode) {
      return res.status(400).json({ error: 'Distance and mode are required' });
    }

    const carbonData = calculateCarbon(distance, mode);
    
    if (mode === 'ev') {
      carbonData.energyKwh = calculateEVEnergy(distance);
    }

    const trip = await Trip.findByIdAndUpdate(
      tripId,
      { 
        distance: parseFloat(distance),
        mode,
        carbonData 
      },
      { new: true }
    );

    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    res.json({ trip, carbonData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTripCarbon = async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    if (!trip.carbonData || !trip.distance) {
      return res.json({
        hasData: false,
        message: 'No carbon data available for this trip',
      });
    }

    res.json({
      hasData: true,
      origin: trip.origin,
      destination: trip.destination,
      distanceKm: trip.distance,
      mode: trip.mode,
      ...trip.carbonData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
