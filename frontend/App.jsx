import React from 'react';
import useAuthStore from './store/authStore';
import AnimatedBackground from './components/layout/AnimatedBackground';
import LoadingSpinner from './components/common/LoadingSpinner';
import LandingPage from './pages/LandingPage';
import CreateProfileModal from './components/auth/CreateProfileModal';
import MainLayout from './components/layout/MainLayout'; 
const App = () => {
  const { status, userProfile } = useAuthStore();

  const renderContent = () => {
    switch (status) {
      case 'initializing':
        return <LoadingSpinner message="Connecting to the Internet Computer..." />;
      
      case 'unauthenticated':
        return <LandingPage />;

      case 'authenticated':
        // User is authenticated, but do they have a SectorNet profile?
        if (userProfile) {
          // Yes, they have a profile. Show the main application.
          return <MainLayout />;
        } else {
          // No profile found. They need to create one.
          // Show the landing page dimmed in the background and the modal on top.
          return (
            <>
              <LandingPage />
              <CreateProfileModal isVisible={true} />
            </>
          );
        }

      default:
        return <LandingPage />;
    }
  };

  return (
    <main>
      <AnimatedBackground />
      <div class="absolute top-0 left-0 h-screen w-screen">{renderContent()}</div>
    </main>
  );
};

export default App;
