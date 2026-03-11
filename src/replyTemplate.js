function buildAutoReply(subject, body, fromAddress) {
  const safeSubject = subject || 'Your email has been received';

  return {
    subject: `Re: ${safeSubject}`,
    text: [
      'Hello,',
      '',
      'This is an automated reply to let you know that your email has been received.',
      'We will review your message and get back to you as soon as possible if a response is required.',
      '',
      'Best regards,',
      'Auto Reply System'
    ].join('\n')
  };
}

module.exports = {
  buildAutoReply
};

