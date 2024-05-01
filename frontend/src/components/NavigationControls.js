import { useNavigate } from 'react-router-dom';

function NavigationControls() {
    const navigate = useNavigate();

    return (
        <div>
            {/* Button to navigate back */}
            <button onClick={() => navigate(-1)} aria-label="Go back">Back</button>

            {/* Button to navigate forward */}
            <button onClick={() => navigate(1)} aria-label="Go forward">Forward</button>
        </div>
    );
}

export default NavigationControls;
