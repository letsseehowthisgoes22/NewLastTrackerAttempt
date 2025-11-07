from datetime import datetime, timedelta
from typing import Dict, List
from collections import defaultdict

class RateLimiter:
    """Simple in-memory rate limiter for message endpoints"""
    
    def __init__(self):
        self.requests: Dict[int, List[datetime]] = defaultdict(list)
    
    def check_rate_limit(self, user_id: int, max_requests: int = 20, window_minutes: int = 1) -> bool:
        """
        Check if user has exceeded rate limit
        Returns True if allowed, False if rate limit exceeded
        """
        now = datetime.now()
        cutoff = now - timedelta(minutes=window_minutes)
        
        self.requests[user_id] = [
            req_time for req_time in self.requests[user_id]
            if req_time > cutoff
        ]
        
        if len(self.requests[user_id]) >= max_requests:
            return False
        
        self.requests[user_id].append(now)
        return True

rate_limiter = RateLimiter()
